import { Prisma } from "@prisma/client";
import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  objects: new Set<string>(),
}));
vi.mock("@/lib/auth/server", () => ({
  requireLandlord: async () => ({ id: "owner" }),
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    property: { findFirst: async () => ({ id: "property" }) },
    sourceDocument: { findUnique: f.findUnique, findFirst: f.findFirst },
    bill: { create: f.create },
  }),
}));
vi.mock("@/lib/storage/server", () => ({
  bucket: () => "private-evidence",
  readUploaded: async (path: string) => {
    if (!f.objects.has(path)) throw new Error("Evidence missing");
    return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  },
  storage: () => ({ from: () => ({ remove: f.remove }) }),
}));
import { POST } from "@/app/api/organizer/bills/upload-finalize/route";
import { AppError } from "@/lib/http";

const savedPath = "owner/saved.png";
const redundantPath = "owner/redundant.png";
const saved = {
  id: "document",
  storagePath: savedPath,
  bill: { id: "bill", propertyId: "property" },
};
function finalize(path: string, propertyId = "property") {
  return POST(
    new Request("https://app.example/api/organizer/bills/upload-finalize", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, propertyId }),
    }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://app.example");
  f.objects.clear();
  f.objects.add(savedPath);
  f.objects.add(redundantPath);
  f.remove.mockImplementation(async (paths: string[]) => {
    for (const path of paths) f.objects.delete(path);
    return { error: null };
  });
  f.findFirst.mockImplementation(async ({ where }) =>
    where.storagePath === savedPath ? { id: saved.id } : null,
  );
});

it.each([
  { path: savedPath, propertyId: "property", status: 200 },
  { path: savedPath, propertyId: "other-property", status: 409 },
  { path: redundantPath, propertyId: "property", status: 200 },
])(
  "preserves evidence for replay $path / $propertyId",
  async ({ path, propertyId, status }) => {
    f.findUnique.mockResolvedValue(saved);
    const response = await finalize(path, propertyId);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(
      status === 200
        ? { billId: "bill", duplicate: true }
        : { error: "DUPLICATE_OTHER_PROPERTY" },
    );
    expect(f.objects.has(savedPath)).toBe(true);
    expect(f.objects.has(path)).toBe(path === savedPath);
    expect(f.create).not.toHaveBeenCalled();
  },
);

it.each([savedPath, redundantPath])(
  "resolves a concurrent finalize for %s without deleting the winning evidence",
  async (path) => {
    f.findUnique.mockResolvedValueOnce(null).mockResolvedValue(saved);
    f.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Duplicate", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const response = await finalize(path);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ billId: "bill", duplicate: true });
    expect(f.objects.has(savedPath)).toBe(true);
    expect(f.objects.has(path)).toBe(path === savedPath);
  },
);

it.each(["absent", "lookup-failed"])(
  "preserves the original create error when cleanup is %s",
  async (ownership) => {
    f.findUnique.mockResolvedValue(null);
    f.create.mockRejectedValue(new AppError(503, "CREATE_UNAVAILABLE"));
    const path = redundantPath;
    if (ownership === "lookup-failed") {
      f.findUnique
        .mockResolvedValueOnce(null)
        .mockRejectedValue(new Error("Database unavailable"));
    }
    const response = await finalize(path);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "CREATE_UNAVAILABLE" });
    expect(f.objects.has(savedPath)).toBe(true);
    expect(f.objects.has(path)).toBe(true);
  },
);

it("retains evidence when another same-path finalize commits after a failed create", async () => {
  const { promise: winnerMayCommit, resolve: releaseWinner } =
    Promise.withResolvers<void>();
  f.findUnique.mockResolvedValue(null);
  f.create
    .mockImplementationOnce(async () => {
      await winnerMayCommit;
      f.findUnique.mockResolvedValue(saved);
      return saved.bill;
    })
    .mockRejectedValueOnce(new AppError(503, "CREATE_UNAVAILABLE"));
  const winner = finalize(savedPath);
  const loser = await finalize(savedPath);
  expect(loser.status).toBe(503);
  expect(await loser.json()).toEqual({ error: "CREATE_UNAVAILABLE" });
  releaseWinner();
  expect((await winner).status).toBe(200);
  // A subsequent replay must still read the original bytes, not a missing file.
  const replay = await finalize(savedPath);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual({ billId: "bill", duplicate: true });
  expect(f.objects.has(savedPath)).toBe(true);
});

it("rejects client-selected provenance without changing the stored evidence", async () => {
  const response = await POST(
    new Request("https://app.example/api/organizer/bills/upload-finalize", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: savedPath,
        propertyId: "property",
        synthetic: true,
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "INVALID_INPUT" });
  expect(f.objects.has(savedPath)).toBe(true);
  expect(f.create).not.toHaveBeenCalled();
});
