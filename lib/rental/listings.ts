export interface RentalListing {
  source?: "published" | "demo";
  imageKey?: string;
  isDemo?: boolean;
  rentalMode?: "WHOLE" | "ROOMS";
  id: string;
  titleCN: string;
  titleEN: string;
  city: string;
  cityCN: string;
  cityAliases: string[];
  neighborhoodCN: string;
  neighborhoodEN: string;
  rent: string;
  currency: "EUR";
  rooms: number;
  sizeM2: number;
  furnished: boolean;
  availableFrom: string;
  featuresCN: string[];
  featuresEN: string[];
  summaryCN: string;
  summaryEN: string;
}
