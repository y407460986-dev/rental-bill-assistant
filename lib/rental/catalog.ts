import "server-only";
import type { Prisma } from "@prisma/client";
import { cityAliases } from "./cities";
import { getDb } from "@/lib/db";
import type { RentalListing } from "./listings";
import { featureLabels, policyText } from "./contracts";

const publicListingWhere = {
  isPublished: true,
  isDemo: false,
  city: { not: null },
  description: { not: null },
  currency: "EUR",
} as const;
const select = {
  id: true,
  title: true,
  city: true,
  neighborhood: true,
  description: true,
  rentalMode: true,
  currency: true,
  advertisedRent: true,
  roomCount: true,
  sizeM2: true,
  furnished: true,
  availableFrom: true,
  features: true,
  imageKey: true,
  isPublished: true,
  isDemo: true,
  rooms: { select: { id: true, name: true, capacity: true } },
  policies: {
    where: { policyKey: "listing-electricity" },
    select: { id: true },
  },
} as const;
type ListingRow = Prisma.PropertyGetPayload<{ select: typeof select }>;

function publicListing(row: ListingRow): RentalListing | null {
  if (
    !row.isPublished ||
    row.isDemo ||
    !row.city ||
    !row.description ||
    row.currency !== "EUR" ||
    !row.advertisedRent ||
    !row.sizeM2 ||
    !row.availableFrom ||
    row.policies.length !== 1
  )
    return null;
  return {
    id: row.id,
    titleCN: row.title,
    titleEN: row.title,
    city: row.city,
    cityCN: row.city,
    cityAliases: cityAliases(row.city),
    neighborhoodCN: row.neighborhood ?? "",
    neighborhoodEN: row.neighborhood ?? "",
    rent: row.advertisedRent.toFixed(2),
    currency: "EUR",
    rooms: row.rentalMode === "ROOMS" ? 1 : row.roomCount,
    sizeM2: row.sizeM2,
    furnished: row.furnished,
    availableFrom: row.availableFrom.toISOString().slice(0, 10),
    featuresCN: row.features.map((key) => featureLabels[key]?.[0] ?? key),
    featuresEN: row.features.map((key) => featureLabels[key]?.[1] ?? key),
    summaryCN: row.description,
    summaryEN: row.description,
    imageKey: row.imageKey,
    isDemo: false,
    source: "published",
    rentalMode: row.rentalMode,
  };
}

export async function publishedListings(): Promise<RentalListing[]> {
  const rows = await getDb().property.findMany({
    where: publicListingWhere,
    select,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.flatMap((row) => {
    const listing = publicListing(row);
    return listing ? [listing] : [];
  });
}
export async function catalog() {
  return publishedListings();
}
export interface ListingDetail {
  listing: RentalListing;
  rooms: { id: string; name: string; capacity: number }[];
  policy: { id: string; zh: string; en: string };
}
export async function listingDetail(id: string): Promise<ListingDetail | null> {
  const row = await getDb().property.findFirst({
    where: { ...publicListingWhere, id },
    select,
  });
  if (!row) return null;
  const listing = publicListing(row);
  if (!listing) return null;
  return {
    listing,
    rooms: row.rooms,
    policy: { id: row.policies[0].id, ...policyText },
  };
}
export type CatalogListing = RentalListing;
