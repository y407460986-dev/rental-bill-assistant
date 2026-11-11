import type { PrismaClient } from "@prisma/client";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { applyForListing } from "../workflow";

it("rejects a fixture-marked listing even when its published id is known", async () => {
  const tx = {
    $queryRaw: async () => [{ id: "fixture-property" }],
    property: {
      findUniqueOrThrow: async () => ({
        id: "fixture-property",
        landlordId: "landlord",
        isPublished: true,
        isDemo: true,
        city: "Berlin",
        description: "Historical fixture property",
        rentalMode: "WHOLE",
        availableFrom: new Date("2099-01-01T00:00:00Z"),
        rooms: [],
        policies: [],
      }),
    },
  };
  const db = {
    $transaction: async (action: (client: typeof tx) => unknown) => action(tx),
  } as unknown as PrismaClient;
  await expect(
    applyForListing(
      "tenant",
      "fixture-property",
      {
        roomId: null,
        start: "2099-01-01",
        end: null,
        policyId: "known-fixture-policy",
        consent: true,
      },
      db,
    ),
  ).rejects.toMatchObject({ code: "LISTING_UNAVAILABLE", status: 404 });
});
