import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { RentalListing } from "@/lib/rental/listings";
import Icon from "./Icon";
export type ListingDisplay = Pick<
  RentalListing,
  | "id"
  | "titleCN"
  | "titleEN"
  | "city"
  | "cityCN"
  | "neighborhoodCN"
  | "neighborhoodEN"
  | "rent"
  | "rooms"
  | "sizeM2"
  | "furnished"
  | "availableFrom"
  | "featuresCN"
  | "featuresEN"
  | "summaryCN"
  | "summaryEN"
> &
  Pick<RentalListing, "source" | "imageKey" | "isDemo" | "rentalMode">;
export default function ListingCard({
  listing: l,
  en = false,
  reasons,
  warnings,
  children,
}: {
  listing: ListingDisplay;
  en?: boolean;
  reasons?: string[];
  warnings?: string[];
  children?: ReactNode;
}) {
  const title = en ? l.titleEN : l.titleCN;
  const href = "/properties/" + l.id;
  const photo = l.imageKey || "living-room";
  return (
    <article className="home-card">
      <Link href={href} className="home-card-image" aria-label={title}>
        <Image
          src={"/images/" + photo + ".jpg"}
          alt={
            en
              ? "Illustrative interior, not a property photograph"
              : "室内示意图片，非房源实拍"
          }
          width={1400}
          height={
            photo === "living-room"
              ? 1050
              : photo === "quiet-bedroom"
                ? 788
                : 933
          }
          sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 33vw"
        />
        <span className="listing-source">
          {en ? "Applications open" : "可申请"}
        </span>
        <span className="photo-note">
          {en ? "Illustrative photo" : "示意图片"}
        </span>
      </Link>
      <div className="home-card-body">
        <div className="home-card-price">
          <strong>
            €
            {Number(l.rent).toLocaleString(en ? "en-US" : "zh-CN", {
              maximumFractionDigits: 2,
            })}
          </strong>
          <span>
            {l.rentalMode === "ROOMS"
              ? en
                ? "/ room / month"
                : "/ 间 / 月"
              : en
                ? "/ month"
                : "/ 月"}
          </span>
        </div>
        <p className="location-line">
          <Icon name="location" size={14} />
          {en ? l.city : l.cityCN} · {en ? l.neighborhoodEN : l.neighborhoodCN}
        </p>
        <h3>
          <Link href={href}>{title}</Link>
        </h3>
        <div className="home-facts">
          <span>
            {l.rentalMode === "ROOMS"
              ? en
                ? "Private room"
                : "独立房间"
              : en
                ? "Entire home"
                : "整套出租"}
          </span>
          <span>
            {l.sizeM2} m²
            {l.rentalMode === "ROOMS" ? (en ? " shared home" : "（整套）") : ""}
          </span>
          {l.rentalMode !== "ROOMS" && (
            <span>
              {l.rooms} {en ? "rooms" : "间"}
            </span>
          )}
          <span>
            {l.furnished
              ? en
                ? "Furnished"
                : "带家具"
              : en
                ? "Unfurnished"
                : "不带家具"}
          </span>
        </div>
        <p className="listing-summary">{en ? l.summaryEN : l.summaryCN}</p>
        <p className="listing-availability">
          <Icon name="check" size={15} />
          {en ? "Available from " : "可入住日期 "}
          <time dateTime={l.availableFrom}>{l.availableFrom}</time>
        </p>
        <details className="listing-match">
          <summary>{en ? "About this listing" : "房源说明"}</summary>
          <p>
            {en
              ? "Information is supplied by the publisher. Confirm details and availability with the landlord before moving in."
              : "信息由发布者提供，请在入住前向房东核实详情与可入住情况。"}
          </p>
        </details>
        {!!reasons?.length && (
          <details className="listing-match">
            <summary>
              <Icon name="sparkle" size={15} />
              {en ? "Why it matches" : "查看匹配理由"}
            </summary>
            <ul>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </details>
        )}
        {!!warnings?.length && (
          <p className="notice notice-warning">{warnings.join("；")}</p>
        )}
        {children}
        <Link href={href} className="card-link">
          {en ? "View home & apply" : "查看房源与申请"}
          <Icon name="arrow" size={16} />
        </Link>
      </div>
    </article>
  );
}
