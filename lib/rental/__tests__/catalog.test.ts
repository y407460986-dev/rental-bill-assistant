import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RentalListing } from "../listings";
import type { RentalSearchResponse } from "../search";
import type { ListingDetail } from "../catalog";

const db = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ getDb: () => ({ property: db }) }));
vi.mock("@/lib/ai/rental-search", () => ({
  analyzeRentalQuery: async () => ({ filters: null, reason: "not-configured" }),
}));
import { GET as listProperties } from "@/app/api/properties/route";
import { GET as getProperty } from "@/app/api/properties/[id]/route";
import { POST as searchProperties } from "@/app/api/properties/search/route";

function property(id: string, overrides = {}) {
  return {
    id,
    title: "Published Berlin home",
    city: "Berlin",
    neighborhood: "Mitte",
    description: "A furnished home near public transport.",
    rentalMode: "ROOMS",
    currency: "EUR",
    advertisedRent: new Prisma.Decimal("750.00"),
    roomCount: 2,
    sizeM2: 60,
    furnished: true,
    availableFrom: new Date("2027-01-01T00:00:00.000Z"),
    features: ["transit"],
    imageKey: "shared-space",
    isPublished: true,
    isDemo: false,
    rooms: [{ id: "room-one", name: "Garden room", capacity: 1 }],
    policies: [{ id: "electricity-policy" }],
    ...overrides,
  };
}
const real = property("published-home");
const demo = property("historical-demo", { isDemo: true });
const unpublished = property("unpublished-home", { isPublished: false });
const missingPolicy = property("incomplete-home", { policies: [] });

function detail(id: string) {
  return getProperty(new Request("https://app.example/api/properties/" + id), {
    params: Promise.resolve({ id }),
  });
}
function search(query = "Berlin furnished under 850") {
  return searchProperties(
    new Request("https://app.example/api/properties/search", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_BASE_URL", "https://app.example");
  const rows = [real, demo, unpublished, missingPolicy];
  // Return mixed stored records so assertions exercise the public response,
  // rather than reproducing or asserting Prisma query syntax in the mock.
  db.findMany.mockResolvedValue(rows);
  db.findFirst.mockImplementation(
    async ({ where }: { where: { id: string } }) =>
      rows.find((row) => row.id === where.id) ?? null,
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("public rental inventory", () => {
  it("returns only real published complete homes to catalog consumers", async () => {
    const response = await listProperties();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const listings: RentalListing[] = await response.json();
    expect(listings.map((listing) => listing.id)).toEqual([real.id]);
    expect(listings[0]).toMatchObject({
      source: "published",
      isDemo: false,
      rent: "750.00",
      availableFrom: "2027-01-01",
      rentalMode: "ROOMS",
      imageKey: "shared-space",
    });
  });

  it("searches only public homes while preserving filters and local-parser disclosure", async () => {
    const response = await search();
    expect(response.status).toBe(200);
    const result: RentalSearchResponse & { parser: string; inventory: string } =
      await response.json();
    expect(result.results.map(({ listing }) => listing.id)).toEqual([real.id]);
    expect(result.filters).toMatchObject({
      city: "Berlin",
      maxRent: "850.00",
      furnished: true,
    });
    expect(result.parser).toBe("local");
    expect(result.inventory).toBe("published");
    const overBudget = await search("Berlin under 700");
    expect((await overBudget.json()).results).toEqual([]);
  });

  it("returns an empty catalog and search instead of static inventory when nothing is published", async () => {
    db.findMany.mockResolvedValue([demo, unpublished]);
    expect(await (await listProperties()).json()).toEqual([]);
    expect((await (await search()).json()).results).toEqual([]);
  });

  it.each([
    "historical-demo",
    "unpublished-home",
    "incomplete-home",
    "berlin-mitte-studio",
  ])("does not expose nonpublic or old reference detail %s", async (id) => {
    const response = await detail(id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_FOUND" });
  });

  it("preserves publisher imagery, rooms and policy in a real home's detail", async () => {
    const response = await detail(real.id);
    expect(response.status).toBe(200);
    const result: ListingDetail = await response.json();
    expect(result.listing).toMatchObject({
      id: real.id,
      isDemo: false,
      imageKey: real.imageKey,
    });
    expect(result.rooms).toEqual(real.rooms);
    expect(result.policy.id).toBe("electricity-policy");
  });

  it("reports catalog failures without substituting reference homes", async () => {
    db.findMany.mockRejectedValue(new Error("Database unavailable"));
    for (const response of [await listProperties(), await search()]) {
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "REQUEST_FAILED" });
    }
  });
});
