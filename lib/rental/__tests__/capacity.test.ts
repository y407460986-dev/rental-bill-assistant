import { describe, it, expect, vi } from "vitest";
import { hasCapacity, overlaps } from "../capacity";
import { applicationInput, daySchema, listingInput } from "../contracts";
const stay = (start: string, end: string | null) => ({ start, end });
describe("rental capacity and contracts", () => {
  it("uses exclusive ends for same-day changeover", () => {
    expect(
      overlaps(stay("2027-01-01", "2027-02-01"), stay("2027-02-01", null)),
    ).toBe(false);
    expect(
      hasCapacity(
        [stay("2027-01-01", "2027-02-01")],
        stay("2027-02-01", null),
        1,
      ),
    ).toBe(true);
  });
  it("blocks capacity overrun with an ongoing stay", () =>
    expect(
      hasCapacity([stay("2027-01-01", null)], stay("2027-02-01", null), 1),
    ).toBe(false));
  it("allows separate occupants when their intervals do not coincide", () =>
    expect(
      hasCapacity(
        [stay("2027-01-01", "2027-01-15"), stay("2027-01-15", "2027-02-01")],
        stay("2027-01-01", "2027-02-01"),
        2,
      ),
    ).toBe(true));
  it("blocks a peak even if average occupancy is below capacity", () =>
    expect(
      hasCapacity(
        [stay("2027-01-01", "2027-01-20"), stay("2027-01-15", "2027-02-01")],
        stay("2027-01-01", "2027-02-01"),
        2,
      ),
    ).toBe(false));
  it.each(["Asia/Shanghai", "UTC", "America/New_York"])(
    "validates calendar dates independently of %s",
    (timezone) => {
      vi.stubEnv("TZ", timezone);
      try {
        for (const date of ["2028-02-29", "2027-03-14", "2027-11-07"]) {
          expect(daySchema.safeParse(date).success).toBe(true);
          expect(
            applicationInput.safeParse({
              roomId: null,
              start: date,
              end: null,
              policyId: "p",
              consent: true,
            }).success,
          ).toBe(true);
        }
        for (const date of ["2027-02-29", "2028-02-30", "2027-13-01"]) {
          expect(daySchema.safeParse(date).success).toBe(false);
        }
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
  it("rejects calendar rollovers and invalid or unconsented dates", () => {
    expect(daySchema.safeParse("2027-02-30").success).toBe(false);
    expect(daySchema.safeParse("2028-02-29").success).toBe(true);
    expect(
      applicationInput.safeParse({
        roomId: null,
        start: "2027-02-01",
        end: "2027-02-01",
        policyId: "p",
        consent: true,
      }).success,
    ).toBe(false);
    expect(
      applicationInput.safeParse({
        roomId: null,
        start: "2027-02-01",
        end: null,
        policyId: "p",
        consent: false,
      }).success,
    ).toBe(false);
  });
  it("requires room configuration and prevents duplicate names", () => {
    const listing = {
      title: "test home",
      city: "Berlin",
      neighborhood: "Mitte",
      address: "Private address",
      description: "A test listing with sufficient description",
      rentalMode: "ROOMS",
      rent: "850.00",
      sizeM2: 50,
      furnished: true,
      availableFrom: "2027-01-01",
      imageKey: "living-room",
      features: [],
      isDemo: true,
      rooms: [],
    };
    expect(listingInput.safeParse(listing).success).toBe(false);
    expect(
      listingInput.safeParse({
        ...listing,
        rooms: [
          { name: "A", capacity: 1 },
          { name: "A", capacity: 1 },
        ],
      }).success,
    ).toBe(false);
  });
});
