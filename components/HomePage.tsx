"use client";
import Image from "next/image";
import Link from "next/link";
import { useCatalog } from "./ui/useCatalog";
import { SiteFooter } from "./ui/SiteShell";
import { SessionHeader } from "./ui/RentalFrame";
import { useLanguage } from "./ui/useLanguage";
import ListingCard from "./ui/ListingCard";
import Icon from "./ui/Icon";

export default function HomePage() {
  const { en, t } = useLanguage();
  const { listings, error, loading } = useCatalog();

  return (
    <>
      <SessionHeader />
      <main id="content">
        <section
          className="discovery-hero container"
          aria-labelledby="discovery-title"
        >
          <div className="discovery-copy">
            <p className="eyebrow">
              {t(
                "AI 只读账单，钱由代码算",
                "AI READS THE BILL. CODE DOES THE MONEY.",
              )}
            </p>
            <h1 id="discovery-title">
              {t(
                "账单算不平。我们指给你看，但不替你改。",
                "The bill doesn't add up. We show you where.",
              )}
            </h1>
            <p className="discovery-lead">
              {t(
                "上传德语电费账单：AI 只负责读，金额交给确定性代码计算。对不上的地方原样保留，核对后的余额按人天分摊给租客，租客通过 PayPal Sandbox 付款。",
                "Upload a German utility statement. The AI only reads it; deterministic code does the money. Conflicts stay visible, the verified balance splits across tenants, and tenants pay through PayPal Sandbox.",
              )}
            </p>
            <form className="discovery-search" action="/search" method="get">
              <div className="discovery-search-fields">
                <label htmlFor="home-city">
                  {t("想住哪里", "Where")}
                  <input
                    id="home-city"
                    name="city"
                    type="text"
                    maxLength={100}
                    placeholder={t("城市，如柏林", "City, e.g. Berlin")}
                  />
                </label>
                <label htmlFor="home-budget">
                  {t("月租上限 · EUR", "Max monthly rent · EUR")}
                  <input
                    id="home-budget"
                    name="maxRent"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("不限预算", "Any budget")}
                  />
                </label>
                <label htmlFor="home-mode">
                  {t("租住方式", "Home type")}
                  <select id="home-mode" name="mode" defaultValue="">
                    <option value="">
                      {t("整套或房间", "Entire home or room")}
                    </option>
                    <option value="WHOLE">
                      {t("整套出租", "Entire home")}
                    </option>
                    <option value="ROOMS">
                      {t("合租房间", "Room in a shared home")}
                    </option>
                  </select>
                </label>
              </div>
              <div className="discovery-search-actions">
                <details className="discovery-ai">
                  <summary>
                    <Icon name="sparkle" size={16} />
                    {t(
                      "让 AI 帮你细选（可选）",
                      "Add preferences with AI (optional)",
                    )}
                  </summary>
                  <label htmlFor="home-query">
                    {t("说说你在意的细节", "What else matters to you?")}
                  </label>
                  <input
                    id="home-query"
                    name="q"
                    minLength={2}
                    maxLength={500}
                    placeholder={t(
                      "例如：带家具，安静、近地铁",
                      "For example: furnished, quiet, near transit",
                    )}
                  />
                </details>
                <button className="btn btn-primary" type="submit">
                  <Icon name="search" size={18} />
                  {t("找房", "Find homes")}
                </button>
              </div>
            </form>
            <div className="discovery-cities">
              <span>{t("按城市浏览", "Browse by city")}</span>
              {[
                ["柏林", "Berlin"],
                ["汉堡", "Hamburg"],
                ["慕尼黑", "Munich"],
              ].map(([zh, english]) => (
                <Link
                  key={english}
                  href={"/search?city=" + encodeURIComponent(english)}
                >
                  {en ? english : zh}
                  <span aria-hidden="true"> ↗</span>
                </Link>
              ))}
            </div>
          </div>
          <figure className="discovery-photo">
            <Image
              src="/images/living-room.jpg"
              alt={t(
                "明亮客厅的居住氛围示意，非房源实拍",
                "A light-filled living room for inspiration, not a listing photograph",
              )}
              fill
              priority
              sizes="(max-width: 920px) 100vw, 36vw"
            />
            <figcaption>
              {t(
                "居住氛围示意 · 非房源实拍",
                "Interior inspiration · illustrative photo",
              )}
            </figcaption>
          </figure>
        </section>

        <section
          className="discovery-listings container"
          aria-labelledby="discovery-homes-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {t("从这里开始看房", "START EXPLORING")}
              </p>
              <h2 id="discovery-homes-title">
                {t("可申请的房源", "Homes open for applications")}
              </h2>
            </div>
            <Link className="text-link" href="/search">
              {t("查看全部房源", "View all homes")}
              <Icon name="arrow" size={18} />
            </Link>
          </div>
          <p className="inventory-note">
            {t(
              "比较租金、入住日期与费用约定。房源信息由发布者提供，请在入住前核实。",
              "Compare rent, dates and utility terms. Information is supplied by publishers; confirm the details before moving in.",
            )}
          </p>
          <div aria-busy={loading}>
            {loading ? (
              <p className="discovery-state" role="status">
                {t("正在读取已发布房源…", "Loading published homes…")}
              </p>
            ) : error ? (
              <div className="notice notice-warning" role="alert">
                <p>
                  {t(
                    "暂时无法读取房源，请稍后重试。",
                    "We couldn't load available homes. Please try again shortly.",
                  )}
                </p>
                <button
                  className="btn btn-secondary"
                  onClick={() => window.location.reload()}
                >
                  {t("重新加载", "Reload")}
                </button>
              </div>
            ) : listings.length ? (
              <div className="homes-grid">
                {listings.slice(0, 3).map((listing) => (
                  <ListingCard key={listing.id} listing={listing} en={en} />
                ))}
              </div>
            ) : (
              <div className="discovery-state">
                <h3>{t("暂时没有已发布房源", "No published homes yet")}</h3>
                <p>
                  {t(
                    "房东发布后，房源会显示在这里。稍后再来看看。",
                    "Homes will appear here when landlords publish them. Please check back later.",
                  )}
                </p>
              </div>
            )}
          </div>
        </section>

        <section
          id="rental-steps"
          className="discovery-process"
          aria-labelledby="discovery-steps-title"
        >
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {t("从找房到入住", "FROM BROWSING TO MOVING IN")}
                </p>
                <h2 id="discovery-steps-title">
                  {t("每一步，都有下一步。", "A clear next step.")}
                </h2>
              </div>
              <Link className="text-link" href="/rental/applications">
                {t("查看我的申请", "View my applications")}
                <Icon name="arrow" size={18} />
              </Link>
            </div>
            <ol className="discovery-steps">
              {[
                [
                  t("选房，看清约定", "Find a home, review the terms"),
                  t(
                    "比较租金、可入住日期与水电费用规则，选择整套或具体房间。",
                    "Compare rent, availability and utility terms. Choose an entire home or a specific room.",
                  ),
                ],
                [
                  t("提交申请，等待审批", "Apply and follow the decision"),
                  t(
                    "登录后提交期望日期，确认费用约定。房东审批通过后建立入住记录，申请本身不产生扣款。",
                    "Sign in, request your dates and confirm the terms. Landlord approval creates an occupancy record; applying does not charge you.",
                  ),
                ],
                [
                  t("入住后，明白分担", "Move in with clearer bills"),
                  t(
                    "查看房东发布的水电费用与原始凭证，确认个人份额后通过 PayPal 安全付款。",
                    "Review published utility bills and evidence, confirm your share, then pay securely with PayPal.",
                  ),
                ],
              ].map(([title, body], index) => (
                <li key={title}>
                  <span className="discovery-step-number" aria-hidden="true">
                    0{index + 1}
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section
          className="discovery-landlord container"
          aria-labelledby="discovery-landlord-title"
        >
          <div>
            <p className="eyebrow">{t("给房东", "FOR LANDLORDS")}</p>
            <h2 id="discovery-landlord-title">
              {t(
                "把空房，变成下一段日常。",
                "Make room for someone's next chapter.",
              )}
            </h2>
            <p>
              {t(
                "创建房源、明确费用约定、处理申请，入住后再管理共同账单。",
                "Publish your home and its terms, review applications, then manage shared bills after move-in.",
              )}
            </p>
          </div>
          <Link href="/organizer/listings" className="btn btn-primary">
            {t("发布与管理房源", "List and manage homes")}
            <Icon name="arrow" size={18} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
