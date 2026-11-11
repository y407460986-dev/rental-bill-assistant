import { describe, it, expect } from "vitest";
import { parseAiRentalFilters } from "@/lib/ai/rental-filters";
import { searchRentalListings, parseRentalQuery } from "../search";
import { rentalListings } from "@/lib/testing/rental-listings";
describe("provider response normalization", () => {
  it("accepts the actual numeric budget response without dropping AI", () => {
    expect(
      parseAiRentalFilters(
        JSON.stringify({
          city: "berlin",
          maxRent: 850,
          minRooms: null,
          furnished: true,
          keywords: ["quiet", "near transit"],
        }),
      ),
    ).toEqual({
      city: "Berlin",
      maxRent: "850.00",
      minRooms: undefined,
      furnished: true,
      keywords: ["quiet", "transit"],
    });
  });
  it("rejects malformed or impossible budgets instead of broadening results", () => {
    for (const v of ["EUR 850", -1, "850.333", "oops"])
      expect(() =>
        parseAiRentalFilters(JSON.stringify({ maxRent: v })),
      ).toThrow();
  });
  it("preserves explicit unfurnished preferences", () => {
    expect(
      parseRentalQuery("Berlin unfurnished under 1200", rentalListings)
        .furnished,
    ).toBe(false);
    expect(
      searchRentalListings(
        "Berlin unfurnished under 1200",
        rentalListings,
      ).results.every((r) => !r.listing.furnished),
    ).toBe(true);
  });
  it("never inserts an unrequested ten-percent budget overrun", () => {
    const result = searchRentalListings("Hamburg under 850", rentalListings);
    expect(result.results).toHaveLength(0);
  });
});
