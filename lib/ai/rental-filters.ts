import { z } from "zod";
import { canonicalCity } from "@/lib/rental/cities";
import { MoneyDecimal } from "@/lib/utils/decimal";
import type { RentalSearchFilters } from "@/lib/rental/search";
const schema = z.object({
  city: z.string().trim().max(80).nullish(),
  maxRent: z.union([z.string(), z.number().finite()]).nullish(),
  minRooms: z.number().int().min(1).max(20).nullish(),
  furnished: z.boolean().nullish(),
  keywords: z.array(z.string().max(60)).max(12).default([]),
});
const keywords: Record<string, string> = {
  "near transit": "transit",
  "near metro": "transit",
  "pet friendly": "pets",
  "pet-friendly": "pets",
  "student friendly": "student",
  "short-term": "shortTerm",
  shortterm: "shortTerm",
};
export function parseAiRentalFilters(
  content: string,
): Partial<RentalSearchFilters> {
  const clean = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const raw = schema.parse(JSON.parse(clean));
  let maxRent: string | undefined;
  if (raw.maxRent != null) {
    const v = String(raw.maxRent);
    if (!/^[0-9]{1,6}([.][0-9]{1,2})?$/.test(v))
      throw new Error("INVALID_AI_BUDGET");
    const amount = new MoneyDecimal(v);
    if (amount.lte(0) || amount.gt(100000))
      throw new Error("INVALID_AI_BUDGET");
    maxRent = amount.toFixed(2);
  }
  return {
    city: raw.city ? canonicalCity(raw.city) : undefined,
    maxRent,
    minRooms: raw.minRooms ?? undefined,
    furnished: raw.furnished ?? undefined,
    keywords: [
      ...new Set(
        raw.keywords
          .map((k) => keywords[k.toLowerCase()] ?? k)
          .filter((k) =>
            [
              "quiet",
              "balcony",
              "transit",
              "pets",
              "family",
              "student",
              "park",
              "shortTerm",
            ].includes(k),
          ),
      ),
    ],
  };
}
