"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type { ListingDetail as Detail } from "@/lib/rental/catalog";
import { useLanguage } from "./ui/useLanguage";
import { rentalRequest, useRemote } from "./ui/useRemote";
import { RentalError, RentalFrame } from "./ui/RentalFrame";
import Icon from "./ui/Icon";
export default function ListingDetail({ id }: { id: string }) {
  const { en, t } = useLanguage();
  const remote = useRemote<Detail>("/api/properties/" + id);
  const who = useRemote<{ role: string }>("/api/auth/me");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const running = useRef(false);
  const data = remote.data;
  const today = new Date().toISOString().slice(0, 10);
  const earliest =
    data && data.listing.availableFrom > today
      ? data.listing.availableFrom
      : today;
  async function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (running.current || !data?.policy) return;
    running.current = true;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await rentalRequest("/api/properties/" + id + "/apply", {
        roomId: form.get("roomId") || null,
        start: form.get("start"),
        end: form.get("end") || null,
        policyId: data.policy.id,
        consent: form.get("consent") === "on",
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <RentalFrame active="search">
      <nav
        className="property-breadcrumb"
        aria-label={t("当前位置", "Breadcrumb")}
      >
        <Link href="/search">{t("查找房源", "Find a home")}</Link>
        <span aria-hidden="true">/</span>
        <span>
          {data
            ? en
              ? data.listing.city
              : data.listing.cityCN
            : t("房源详情", "Property details")}
        </span>
      </nav>
      <RentalError error={remote.error} retry={remote.reload} />
      {remote.loading && (
        <p role="status" className="property-loading">
          {t("正在加载房源信息…", "Loading property details…")}
        </p>
      )}
      {data && (
        <section className="property-page" data-od-id="listing-detail">
          <header className="property-heading">
            <div className="property-heading-meta">
              <span className="status-pill">
                {t("接受入住申请", "Applications open")}
              </span>
            </div>
            <h1>{en ? data.listing.titleEN : data.listing.titleCN}</h1>
            <p className="location-line">
              <Icon name="location" size={17} />
              {en ? data.listing.city : data.listing.cityCN} ·{" "}
              {en ? data.listing.neighborhoodEN : data.listing.neighborhoodCN}
            </p>
          </header>
          <div className="property-layout">
            <figure className="property-photo">
              <Image
                className="listing-detail-image"
                src={
                  "/images/" + (data.listing.imageKey || "living-room") + ".jpg"
                }
                width={1400}
                height={
                  (data.listing.imageKey || "living-room") === "living-room"
                    ? 1050
                    : data.listing.imageKey === "quiet-bedroom"
                      ? 788
                      : 933
                }
                sizes="(max-width:920px) 100vw, 65vw"
                priority
                alt={t(
                  "室内示意图片，非房源实拍",
                  "Illustrative interior, not a property photograph",
                )}
              />
              <figcaption>
                {t(
                  "图片仅作空间示意，不代表房源实拍。",
                  "Illustrative interior; not a photograph of this property.",
                )}
              </figcaption>
            </figure>
            <aside
              className="property-booking"
              id="rental-request"
              aria-labelledby="rental-request-title"
            >
              <div className="property-price">
                <strong>
                  €
                  {Number(data.listing.rent).toLocaleString(
                    en ? "en-US" : "zh-CN",
                    { maximumFractionDigits: 2 },
                  )}
                </strong>
                <span>
                  {data.listing.rentalMode === "ROOMS"
                    ? t("/ 间 / 月", "/ room / month")
                    : t("/ 月", "/ month")}
                </span>
              </div>
              <p className="property-price-note">
                {t(
                  "展示租金，平台不收取租金或押金。",
                  "Advertised rent. Rent and deposits are not collected here.",
                )}
              </p>
              <div className="property-available">
                <Icon name="check" size={16} />
                <span>
                  {t("可入住日期", "Available from")}{" "}
                  <time dateTime={data.listing.availableFrom}>
                    {data.listing.availableFrom}
                  </time>
                </span>
              </div>
              <h2 id="rental-request-title">
                {success
                  ? t("申请已送达", "Application received")
                  : t("安排你的入住", "Plan your stay")}
              </h2>
              <RentalError error={error} />
              {success ? (
                <div className="property-success" role="status">
                  <Icon name="check" size={26} />
                  <p>
                    {t(
                      "申请已提交，等待房东确认。你可以在申请页跟进进度。",
                      "Your application is awaiting the landlord’s decision. Track its progress in your stays.",
                    )}
                  </p>
                  <Link className="btn btn-primary" href="/rental/applications">
                    {t("查看我的申请", "View my application")}
                  </Link>
                </div>
              ) : who.loading ? (
                <p role="status">
                  {t("正在确认登录状态…", "Checking your account…")}
                </p>
              ) : who.error && who.error !== "LOGIN_REQUIRED" ? (
                <RentalError error={who.error} retry={who.reload} />
              ) : !who.data ? (
                <>
                  <p>
                    {t(
                      "登录租客账号，选择日期并向房东提交申请。提交申请不会扣款。",
                      "Sign in as a tenant to choose dates and apply. Sending an application does not charge you.",
                    )}
                  </p>
                  <Link
                    className="btn btn-primary"
                    href={"/login?next=/properties/" + id}
                  >
                    {t("登录并申请入住", "Sign in to apply")}
                  </Link>
                </>
              ) : who.data.role !== "TENANT" ? (
                <>
                  <p>
                    {t(
                      "你正在使用房东账号。入住申请需使用租客账号提交。",
                      "You are signed in as a landlord. Applications require a tenant account.",
                    )}
                  </p>
                  <Link
                    className="btn btn-secondary"
                    href="/organizer/listings"
                  >
                    {t("管理我的房源", "Manage my listings")}
                  </Link>
                </>
              ) : (
                <form onSubmit={apply} className="property-request-form">
                  {data.listing.rentalMode === "ROOMS" ? (
                    <label>
                      {t("选择房间", "Choose a room")}
                      <select name="roomId" required disabled={busy}>
                        {data.rooms.map((room) => (
                          <option value={room.id} key={room.id}>
                            {room.name} · {room.capacity}{" "}
                            {t("人容量", "places")}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <input type="hidden" name="roomId" value="" />
                  )}
                  <div className="property-request-dates">
                    <label>
                      {t("入住日期", "Move-in date")}
                      <input
                        name="start"
                        type="date"
                        min={earliest}
                        required
                        disabled={busy}
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                      />
                    </label>
                    <label>
                      {t("结束日期（选填）", "End date (optional)")}
                      <input
                        name="end"
                        type="date"
                        min={startDate || earliest}
                        disabled={busy}
                      />
                    </label>
                  </div>
                  <p className="field-hint">
                    {t(
                      "开始日计入入住，结束日不计入；未定结束日期可留空。",
                      "Your start date is included; the end date is excluded. Leave it blank for an ongoing stay.",
                    )}
                  </p>
                  <label className="property-consent">
                    <input
                      name="consent"
                      type="checkbox"
                      required
                      disabled={busy}
                    />
                    <span>
                      {t(
                        "我同意下方的费用约定，并确认上述入住日期。",
                        "I accept the utility terms below and confirm these dates.",
                      )}{" "}
                      <a href="#utility-terms">{t("查看约定", "Read terms")}</a>
                    </span>
                  </label>
                  <button className="btn btn-primary" disabled={busy}>
                    {busy
                      ? t("正在提交…", "Sending…")
                      : t("提交入住申请", "Send application")}
                    <Icon name="arrow" size={16} />
                  </button>
                  <p className="field-hint">
                    {t(
                      "房东批准后建立入住记录。申请或批准均不会扣款。",
                      "Approval creates your occupancy record. Neither applying nor approval triggers payment.",
                    )}
                  </p>
                </form>
              )}
            </aside>
            <div className="property-information">
              <dl className="property-facts">
                <div>
                  <dt>{t("出租方式", "Rental type")}</dt>
                  <dd>
                    {data.listing.rentalMode === "ROOMS"
                      ? t("独立房间", "Private room")
                      : t("整套出租", "Entire home")}
                  </dd>
                </div>
                <div>
                  <dt>{t("面积", "Floor area")}</dt>
                  <dd>
                    {data.listing.sizeM2} m²
                    {data.listing.rentalMode === "ROOMS" && (
                      <small>
                        {t("整套面积，非单间面积", "Whole home, not the room")}
                      </small>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("家具", "Furnishing")}</dt>
                  <dd>
                    {data.listing.furnished
                      ? t("带家具", "Furnished")
                      : t("不带家具", "Unfurnished")}
                  </dd>
                </div>
                <div>
                  <dt>
                    {data.listing.rentalMode === "ROOMS"
                      ? t("房间选择", "Room options")
                      : t("房间数", "Rooms")}
                  </dt>
                  <dd>
                    {data.listing.rentalMode === "ROOMS"
                      ? data.rooms.length
                      : data.listing.rooms}
                  </dd>
                </div>
              </dl>
              <details className="property-section">
                <summary>{t("房源说明", "About this listing")}</summary>
                <p>
                  {t(
                    "房源信息由发布者提供，请在入住前向房东核实详情与可入住情况。",
                    "Information is supplied by the publisher. Confirm details and availability with the landlord before moving in.",
                  )}
                </p>
              </details>
              <section className="property-section">
                <h2>{t("关于这个住处", "About this home")}</h2>
                <p>{en ? data.listing.summaryEN : data.listing.summaryCN}</p>
                <ul className="property-features">
                  {(en ? data.listing.featuresEN : data.listing.featuresCN).map(
                    (feature) => (
                      <li key={feature}>
                        <Icon name="check" size={16} />
                        {feature}
                      </li>
                    ),
                  )}
                </ul>
              </section>
              <section className="property-section" id="utility-terms">
                <h2>{t("入住与费用说明", "Your stay & shared costs")}</h2>
                <p>{en ? data.policy.en : data.policy.zh}</p>
                <p className="field-hint">
                  {t(
                    "房源信息由发布者提供，请在入住前核实。详细地址不会在公开页面展示。",
                    "Listing information is supplied by the publisher; verify it before moving in. Exact addresses are not public.",
                  )}
                </p>
              </section>
              <section className="property-section">
                <h2>{t("接下来会发生什么", "What happens next")}</h2>
                <ol className="property-next-steps">
                  <li>
                    <strong>{t("提交申请", "Apply")}</strong>
                    <span>
                      {t(
                        "选择房间和日期，确认费用约定。",
                        "Choose your room and dates, then accept the terms.",
                      )}
                    </span>
                  </li>
                  <li>
                    <strong>{t("等待房东确认", "Landlord review")}</strong>
                    <span>
                      {t(
                        "在申请页查看处理进度。",
                        "Follow the decision in your applications.",
                      )}
                    </span>
                  </li>
                  <li>
                    <strong>{t("查看入住安排", "Your stay")}</strong>
                    <span>
                      {t(
                        "批准后保留入住日期和双方确认的约定。",
                        "Approved dates and both parties’ terms stay on record.",
                      )}
                    </span>
                  </li>
                </ol>
              </section>
            </div>
          </div>
          {!success && (
            <div className="property-mobile-action">
              <span>
                <strong>
                  €
                  {Number(data.listing.rent).toLocaleString(
                    en ? "en-US" : "zh-CN",
                    { maximumFractionDigits: 2 },
                  )}
                </strong>{" "}
                {data.listing.rentalMode === "ROOMS"
                  ? t("/ 间 / 月", "/ room / month")
                  : t("/ 月", "/ month")}
              </span>
              <a className="btn btn-primary" href="#rental-request">
                {t("查看入住安排", "Plan your stay")}
              </a>
            </div>
          )}
        </section>
      )}
    </RentalFrame>
  );
}
