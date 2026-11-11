import { describe, expect, it } from "vitest";
import { rentalListings } from "@/lib/testing/rental-listings";
import { parseRentalQuery, searchRentalListings } from "../search";

describe("rental search", () => {
  it("parses a Chinese city, budget, room count and preferences", () => {
    const query = "我想在柏林找带家具的一居室，预算 850 欧，最好安静、近地铁";
    const filters = parseRentalQuery(query, rentalListings);
    expect(filters).toMatchObject({
      city: "Berlin",
      maxRent: "850.00",
      minRooms: 1,
      furnished: true,
    });
    expect(filters.keywords).toEqual(
      expect.arrayContaining(["quiet", "transit"]),
    );
    const result = searchRentalListings(query, rentalListings);
    expect(result.results[0].listing.id).toBe("berlin-mitte-studio");
    expect(result.results[0].reasonsCN.join(" ")).toContain("柏林");
  });

  it("filters an English pet-friendly two-room search", () => {
    const result = searchRentalListings(
      "Looking for a two-room flat in Hamburg under EUR 950, pet friendly",
      rentalListings,
    );
    expect(result.filters.city).toBe("Hamburg");
    expect(result.filters.maxRent).toBe("950.00");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].listing.id).toBe("hamburg-altona-two-room");
    expect(result.results[0].reasonsEN.join(" ")).toContain("pet");
  });

  it("does not return homes below the requested room count", () => {
    const result = searchRentalListings(
      "Berlin three rooms under EUR 2000",
      rentalListings,
    );
    expect(result.results).toEqual([]);
  });

  it("can merge AI-extracted filters with the local parser", () => {
    const result = searchRentalListings("找个安静的房子", rentalListings, {
      city: "Berlin",
      maxRent: "1200.00",
      keywords: ["balcony"],
    });
    expect(result.results[0].listing.city).toBe("Berlin");
    expect(result.filters.keywords).toEqual(
      expect.arrayContaining(["balcony", "quiet"]),
    );
  });
  it.each(["Hamburg", "汉堡", "München"])(
    "keeps %s as a constraint even without inventory there",
    (city) => {
      const berlinOnly = rentalListings.filter(
        (listing) => listing.city === "Berlin",
      );
      const result = searchRentalListings(`${city} under 2000`, berlinOnly);
      expect(result.filters.city).toBe(
        city === "München" ? "Munich" : "Hamburg",
      );
      expect(result.results).toEqual([]);
    },
  );
});
