import { beforeEach, it, expect, vi } from "vitest";
const fake = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUnique: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: fake.getUser, signOut: fake.signOut },
  }),
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({ user: { findUnique: fake.findUnique } }),
}));
import { requireUser } from "../server";
import { POST } from "@/app/api/auth/[action]/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  vi.stubEnv("APP_BASE_URL", "https://app.example");
});
it("rejects invalid/expired Auth session before querying app users", async () => {
  fake.getUser.mockResolvedValue({ data: { user: null }, error: {} });
  await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  expect(fake.findUnique).not.toHaveBeenCalled();
});
it("requires a linked application identity", async () => {
  fake.getUser.mockResolvedValue({
    data: { user: { id: "verified-id" } },
    error: null,
  });
  fake.findUnique.mockResolvedValue(null);
  await expect(requireUser()).rejects.toMatchObject({ status: 403 });
  expect(fake.findUnique).toHaveBeenCalledWith({
    where: { authUserId: "verified-id" },
  });
});
it("uses database role rather than user metadata", async () => {
  fake.getUser.mockResolvedValue({
    data: { user: { id: "verified-id", user_metadata: { role: "LANDLORD" } } },
    error: null,
  });
  fake.findUnique.mockResolvedValue({ id: "tenant", role: "TENANT" });
  await expect(requireUser("LANDLORD")).rejects.toMatchObject({ status: 403 });
});
it("logs out only the current session", async () => {
  fake.signOut.mockResolvedValue({ error: null });
  const response = await POST(
    new Request("https://app.example/api/auth/logout", {
      method: "POST",
      headers: { Origin: "https://app.example" },
    }),
    { params: Promise.resolve({ action: "logout" }) },
  );
  expect(response.status).toBe(200);
  expect(fake.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
});
it.each([undefined, "https://foreign.example"])(
  "rejects logout from origin %s without ending a session",
  async (origin) => {
    const response = await POST(
      new Request("https://app.example/api/auth/logout", {
        method: "POST",
        headers: origin ? { Origin: origin } : {},
      }),
      { params: Promise.resolve({ action: "logout" }) },
    );
    expect(response.status).toBe(403);
    expect(fake.signOut).not.toHaveBeenCalled();
  },
);
