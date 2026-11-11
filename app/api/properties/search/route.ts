import { z } from "zod";
import { api, sameOrigin } from "@/lib/http";
import { analyzeRentalQuery } from "@/lib/ai/rental-search";
import { catalog } from "@/lib/rental/catalog";
import { searchRentalListings } from "@/lib/rental/search";
export const maxDuration = 30;
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const { query } = z
      .object({ query: z.string().trim().min(2).max(500) })
      .strict()
      .parse(await request.json());
    const [analysis, listings] = await Promise.all([
      analyzeRentalQuery(query),
      catalog(),
    ]);
    return {
      ...searchRentalListings(query, listings, analysis.filters),
      parser: analysis.filters ? "deepseek" : "local",
      fallbackReason: analysis.reason,
      inventory: "published",
    };
  });
}
