import { MoneyDecimal } from "../utils/decimal";
import type { RentalListing } from "./listings";
import { cityInQuery } from "./cities";

export interface RentalSearchFilters {
  city?: string;
  maxRent?: string;
  minRooms?: number;
  furnished?: boolean;
  keywords: string[];
}

export interface RentalSearchResult {
  listing: RentalListing;
  score: number;
  reasonsCN: string[];
  reasonsEN: string[];
  warningsCN: string[];
  warningsEN: string[];
}

export interface RentalSearchResponse {
  filters: RentalSearchFilters;
  results: RentalSearchResult[];
}

const keywordAliases: Record<string, string[]> = {
  quiet: ["quiet", "安静", "清静"],
  balcony: ["balcony", "阳台"],
  transit: [
    "metro",
    "subway",
    "u-bahn",
    "s-bahn",
    "train",
    "地铁",
    "城铁",
    "交通",
  ],
  pets: ["pet", "pets", "宠物", "养猫", "养狗"],
  family: ["family", "家庭", "孩子", "儿童"],
  student: ["student", "学生", "大学"],
  park: ["park", "公园"],
  shortTerm: ["short-term", "short term", "短租", "过渡"],
};

function normalizeMoney(value: string): string | undefined {
  const normalized = value.replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) return undefined;
  const amount = new MoneyDecimal(normalized);
  if (amount.lt(100) || amount.gt(100000)) return undefined;
  return amount.toFixed(2);
}

function detectCity(
  query: string,
  listings: RentalListing[],
): string | undefined {
  const supportedCity = cityInQuery(query);
  if (supportedCity) return supportedCity;
  const lower = query.toLowerCase();
  for (const listing of listings) {
    if (
      listing.cityAliases.some((alias) => lower.includes(alias.toLowerCase()))
    )
      return listing.city;
  }
  return undefined;
}

function detectBudget(query: string): string | undefined {
  const explicit = query.match(
    /(\d+(?:[,.]\d+)?)\s*(?:€|eur|euro|euros|欧|欧元)/i,
  );
  if (explicit) return normalizeMoney(explicit[1]);
  const budgetWord = query.match(
    /(?:预算|最多|不超过|以内|以下|max(?:imum)?|under|up to)[^\d]{0,12}(\d+(?:[,.]\d+)?)/i,
  );
  if (budgetWord) return normalizeMoney(budgetWord[1]);
  const plausible = query.match(/\b(\d{3,5})(?:[,.]\d{1,2})?\b/);
  return plausible ? normalizeMoney(plausible[1]) : undefined;
}

function detectRooms(query: string): number | undefined {
  const lower = query.toLowerCase();
  if (
    /\b(studio|single room|one[- ]room)\b|单间|一室|一居|单身公寓/.test(lower)
  )
    return 1;
  if (
    /\b(2|two)\s*(?:room|rooms|bed|bedroom|bedrooms)\b|两室|两居|二室|二居/.test(
      lower,
    )
  )
    return 2;
  if (
    /\b(3|three)\s*(?:room|rooms|bed|bedroom|bedrooms)\b|三室|三居/.test(lower)
  )
    return 3;
  if (
    /\b(4|four)\s*(?:room|rooms|bed|bedroom|bedrooms)\b|四室|四居/.test(lower)
  )
    return 4;
  return undefined;
}

function detectKeywords(query: string): string[] {
  const lower = query.toLowerCase();
  return Object.entries(keywordAliases)
    .filter(([, aliases]) =>
      aliases.some((alias) => lower.includes(alias.toLowerCase())),
    )
    .map(([keyword]) => keyword);
}

export function parseRentalQuery(
  query: string,
  listings: RentalListing[],
): RentalSearchFilters {
  return {
    city: detectCity(query, listings),
    maxRent: detectBudget(query),
    minRooms: detectRooms(query),
    furnished:
      /不带家具|无需家具|unfurnished|without furniture|not furnished/i.test(
        query,
      )
        ? false
        : /带家具|家具齐全|拎包入住|furnished/i.test(query)
          ? true
          : undefined,
    keywords: detectKeywords(query),
  };
}

function mergeFilters(
  local: RentalSearchFilters,
  ai?: Partial<RentalSearchFilters> | null,
): RentalSearchFilters {
  if (!ai) return local;
  return {
    city: ai.city ?? local.city,
    maxRent: ai.maxRent ?? local.maxRent,
    minRooms: ai.minRooms ?? local.minRooms,
    furnished: ai.furnished ?? local.furnished,
    keywords: [...new Set([...(ai.keywords ?? []), ...local.keywords])],
  };
}

function featureText(listing: RentalListing, english: boolean): string {
  return (english ? listing.featuresEN : listing.featuresCN)
    .join(" ")
    .toLowerCase();
}

function matchesKeyword(
  listing: RentalListing,
  keyword: string,
  english: boolean,
): boolean {
  const haystack = [
    featureText(listing, english),
    listing.summaryCN.toLowerCase(),
    listing.summaryEN.toLowerCase(),
    listing.neighborhoodCN.toLowerCase(),
    listing.neighborhoodEN.toLowerCase(),
  ].join(" ");
  return keywordAliases[keyword]?.some((alias) =>
    haystack.includes(alias.toLowerCase()),
  );
}

function scoreListing(
  listing: RentalListing,
  filters: RentalSearchFilters,
): RentalSearchResult | null {
  const reasonsCN: string[] = [];
  const reasonsEN: string[] = [];
  const warningsCN: string[] = [];
  const warningsEN: string[] = [];
  let score = 0;

  if (filters.city) {
    if (listing.city.toLowerCase() !== filters.city.toLowerCase()) return null;
    score += 5;
    reasonsCN.push(`城市匹配：${listing.cityCN}`);
    reasonsEN.push(`City match: ${listing.city}`);
  }

  if (filters.maxRent) {
    const rent = new MoneyDecimal(listing.rent);
    const budget = new MoneyDecimal(filters.maxRent);
    if (rent.lte(budget)) {
      score += 4;
      const saved = budget.minus(rent).toFixed(2);
      reasonsCN.push(`月租 EUR ${listing.rent}，低于预算 EUR ${saved}`);
      reasonsEN.push(`Rent is EUR ${listing.rent}, EUR ${saved} under budget`);
    } else return null;
  }

  if (filters.minRooms) {
    if (listing.rooms < filters.minRooms) return null;
    score += 3;
    reasonsCN.push(`${listing.rooms} 间房，满足房间数要求`);
    reasonsEN.push(`${listing.rooms} rooms meet your room requirement`);
  }

  if (filters.furnished !== undefined) {
    if (listing.furnished !== filters.furnished) return null;
    score += 2;
    reasonsCN.push(
      filters.furnished
        ? "带家具，可以减少初始搬家成本"
        : "不带家具，符合你的要求",
    );
    reasonsEN.push(
      filters.furnished
        ? "Furnished, reducing move-in friction"
        : "Unfurnished, as requested",
    );
  }

  for (const keyword of filters.keywords) {
    if (matchesKeyword(listing, keyword, false)) {
      score += 1;
      reasonsCN.push(`偏好匹配：${keywordAliases[keyword]?.[1] ?? keyword}`);
      reasonsEN.push(`Preference match: ${keyword}`);
    } else {
      warningsCN.push(
        `未明确满足偏好：${keywordAliases[keyword]?.[1] ?? keyword}`,
      );
      warningsEN.push(`Preference not explicit: ${keyword}`);
    }
  }

  if (!filters.city && !filters.maxRent && !filters.minRooms) score += 1;
  return { listing, score, reasonsCN, reasonsEN, warningsCN, warningsEN };
}

export function searchRentalListings(
  query: string,
  listings: RentalListing[],
  aiFilters?: Partial<RentalSearchFilters> | null,
): RentalSearchResponse {
  const filters = mergeFilters(parseRentalQuery(query, listings), aiFilters);
  const results = listings
    .map((listing) => scoreListing(listing, filters))
    .filter((result): result is RentalSearchResult => result !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        new MoneyDecimal(a.listing.rent).comparedTo(b.listing.rent),
    );
  return { filters, results };
}
