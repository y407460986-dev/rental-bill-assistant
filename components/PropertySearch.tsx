"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { RentalSearchResponse } from "@/lib/rental/search";
import { SiteFooter } from "./ui/SiteShell";
import { SessionHeader } from "./ui/RentalFrame";
import { useLanguage } from "./ui/useLanguage";
import ListingCard from "./ui/ListingCard";
import Icon from "./ui/Icon";
import { useCatalog } from "./ui/useCatalog";

const preferenceLabels: Record<string, [string, string]> = {
  quiet: ["安静", "Quiet"],
  balcony: ["阳台", "Balcony"],
  transit: ["公共交通", "Public transport"],
  pets: ["可养宠物", "Pet friendly"],
  family: ["适合家庭", "Family friendly"],
  student: ["适合学生", "Student friendly"],
  park: ["近公园", "Near a park"],
  shortTerm: ["短租", "Short-term rental"],
};

interface SearchResponse extends RentalSearchResponse {
  parser: "deepseek" | "local";
}

type SearchState = {
  key: string;
  status: "loading" | "ready" | "error";
  response?: SearchResponse;
};

export default function PropertySearch() {
  const { en, t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();
  const {
    listings,
    error: catalogError,
    loading: catalogLoading,
  } = useCatalog();
  const activeQuery = (params.get("q") ?? "").trim().slice(0, 500);
  const city = (params.get("city") ?? "").trim().slice(0, 100);
  const budgetParam = params.get("maxRent") ?? "";
  const maxRent =
    /^\d+(\.\d{1,2})?$/.test(budgetParam) &&
    Number.isFinite(Number(budgetParam))
      ? budgetParam
      : "";
  const modeParam = params.get("mode");
  const mode = modeParam === "WHOLE" || modeParam === "ROOMS" ? modeParam : "";
  const furnishedParam = params.get("furnished");
  const furnished =
    furnishedParam === "true" || furnishedParam === "false"
      ? furnishedParam
      : "";
  const availableParam = params.get("availableBy") ?? "";
  const availableBy = /^\d{4}-\d{2}-\d{2}$/.test(availableParam)
    ? availableParam
    : "";
  const sortParam = params.get("sort");
  const sort = ["rent-asc", "rent-desc", "available"].includes(sortParam ?? "")
    ? sortParam!
    : "recommended";
  const [attempt, setAttempt] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState<SearchState | null>(null);
  const requestKey = activeQuery + "\u0000" + attempt;
  const invalidQuery = activeQuery.length === 1;

  useEffect(() => {
    if (activeQuery.length < 2) return;
    const controller = new AbortController();
    let active = true;
    // Only q changes or an explicit retry invoke AI. Defer dispatch so effect
    // replay can cancel before a request is sent; discard late responses too.
    const timer = window.setTimeout(async () => {
      setSearch({ key: requestKey, status: "loading" });
      try {
        const response = await fetch("/api/properties/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: activeQuery }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const data: SearchResponse = await response.json();
        if (!active) return;
        setSearch({ key: requestKey, status: "ready", response: data });
      } catch {
        if (active && !controller.signal.aborted)
          setSearch({ key: requestKey, status: "error" });
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeQuery, requestKey]);

  function updateParams(changes: Record<string, string>) {
    const next = new URLSearchParams();
    for (const key of [
      "q",
      "city",
      "maxRent",
      "mode",
      "furnished",
      "availableBy",
      "sort",
    ]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const queryString = next.toString();
    router.push(queryString ? "/search?" + queryString : "/search", {
      scroll: false,
    });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    updateParams(
      Object.fromEntries(
        ["city", "maxRent", "mode", "furnished", "availableBy"].map((key) => [
          key,
          String(values.get(key) ?? "").trim(),
        ]),
      ),
    );
    setFiltersOpen(false);
  }

  function applyQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("q") ?? "",
    ).trim();
    updateParams({ q: query });
  }

  function resetSearch() {
    router.push("/search", { scroll: false });
  }

  const currentSearch = search?.key === requestKey ? search : null;
  const response =
    activeQuery && currentSearch?.status === "ready"
      ? currentSearch.response
      : undefined;
  const busy = activeQuery
    ? !invalidQuery && (!currentSearch || currentSearch.status === "loading")
    : catalogLoading;
  const failed = activeQuery ? currentSearch?.status === "error" : catalogError;
  const sourceResults =
    response?.results ??
    (activeQuery
      ? []
      : listings.map((listing) => ({
          listing,
          score: 0,
          reasonsCN: [],
          reasonsEN: [],
          warningsCN: [],
          warningsEN: [],
        })));
  const normalizedCity = city.toLocaleLowerCase();
  const filtered = sourceResults.filter(({ listing }) => {
    const matchesCity =
      !normalizedCity ||
      [listing.city, listing.cityCN, ...listing.cityAliases].some((name) =>
        name.toLocaleLowerCase().includes(normalizedCity),
      );
    return (
      matchesCity &&
      (!maxRent || Number(listing.rent) <= Number(maxRent)) &&
      (!mode || listing.rentalMode === mode) &&
      (!furnished || listing.furnished === (furnished === "true")) &&
      (!availableBy || listing.availableFrom <= availableBy)
    );
  });
  filtered.sort((a, b) => {
    if (sort === "rent-asc")
      return Number(a.listing.rent) - Number(b.listing.rent);
    if (sort === "rent-desc")
      return Number(b.listing.rent) - Number(a.listing.rent);
    if (sort === "available")
      return a.listing.availableFrom.localeCompare(b.listing.availableFrom);
    return b.score - a.score;
  });
  const filterKey = JSON.stringify([
    city,
    maxRent,
    mode,
    furnished,
    availableBy,
  ]);
  const hasCriteria = Boolean(
    activeQuery ||
    city ||
    maxRent ||
    mode ||
    furnished ||
    availableBy ||
    sort !== "recommended",
  );
  const appliedFilterCount = [
    city,
    maxRent,
    mode,
    furnished,
    availableBy,
  ].filter(Boolean).length;

  return (
    <>
      <SessionHeader active="search" />
      <main id="content" className="container browse-page">
        <header className="browse-heading">
          <p className="eyebrow">
            {t("找到适合你的住处", "FIND YOUR NEXT PLACE")}
          </p>
          <h1>{t("好住处，从这里找。", "A home that fits your life.")}</h1>
          <p>
            {t(
              "按城市、预算和租住方式浏览，或让 AI 帮你整理偏好。",
              "Browse by city, budget and home type, with optional AI help for your preferences.",
            )}
          </p>
        </header>

        <section
          className="browse-controls"
          aria-label={t("搜索条件", "Search criteria")}
        >
          <form
            key={activeQuery}
            className="browse-assist"
            action="/search"
            method="get"
            onSubmit={applyQuery}
          >
            <label htmlFor="rental-query">
              <Icon name="sparkle" size={18} />
              {t("AI 帮你细选", "Refine with AI")}
              <span>{t("可选", "Optional")}</span>
            </label>
            <div className="browse-assist-input">
              <input
                id="rental-query"
                name="q"
                type="text"
                defaultValue={activeQuery}
                minLength={2}
                maxLength={500}
                placeholder={t(
                  "例如：柏林，850 欧以内，带家具、近地铁",
                  "e.g. Berlin, under €850, furnished, near transit",
                )}
                aria-describedby="browse-ai-help"
              />
              <button className="btn btn-primary" type="submit">
                {t("按描述找房", "Find matches")}
                <Icon name="arrow" size={16} />
              </button>
            </div>
            <p id="browse-ai-help">
              {t(
                "先描述你的生活偏好，再用下方条件缩小范围。",
                "Describe what matters to you, then narrow your shortlist with the filters below.",
              )}
            </p>
          </form>
          <button
            type="button"
            className="browse-filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="browse-filter-form"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Icon name="search" size={16} />
            {t("筛选房源", "Filter homes")}
            {appliedFilterCount > 0 && <span>{appliedFilterCount}</span>}
            <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
          </button>
          <form
            key={filterKey}
            id="browse-filter-form"
            className={`browse-filter-form${filtersOpen ? " is-open" : ""}`}
            action="/search"
            method="get"
            onSubmit={applyFilters}
          >
            <input type="hidden" name="q" value={activeQuery} />
            <input type="hidden" name="sort" value={sort} />
            <div className="browse-filter-grid">
              <label htmlFor="browse-city">
                {t("城市", "City")}
                <input
                  id="browse-city"
                  name="city"
                  defaultValue={city}
                  maxLength={100}
                  placeholder={t("不限城市", "Any city")}
                />
              </label>
              <label htmlFor="browse-budget">
                {t("月租上限 · EUR", "Max rent / month · EUR")}
                <input
                  id="browse-budget"
                  name="maxRent"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={maxRent}
                  placeholder={t("不限预算", "Any budget")}
                />
              </label>
              <label htmlFor="browse-mode">
                {t("租住方式", "Home type")}
                <select id="browse-mode" name="mode" defaultValue={mode}>
                  <option value="">{t("不限", "Any type")}</option>
                  <option value="WHOLE">{t("整套出租", "Entire home")}</option>
                  <option value="ROOMS">
                    {t("合租房间", "Room in shared home")}
                  </option>
                </select>
              </label>
              <label htmlFor="browse-furnished">
                {t("家具", "Furnishing")}
                <select
                  id="browse-furnished"
                  name="furnished"
                  defaultValue={furnished}
                >
                  <option value="">{t("不限", "Any furnishing")}</option>
                  <option value="true">{t("带家具", "Furnished")}</option>
                  <option value="false">{t("不带家具", "Unfurnished")}</option>
                </select>
              </label>
              <label htmlFor="browse-available">
                {t("最迟可入住日期", "Available on or before")}
                <input
                  id="browse-available"
                  name="availableBy"
                  type="date"
                  defaultValue={availableBy}
                />
              </label>
              <button type="submit" className="btn btn-secondary">
                {t("应用筛选", "Apply filters")}
              </button>
            </div>
          </form>
          <div className="browse-controls-bottom">
            <button
              type="button"
              className="browse-reset"
              disabled={!hasCriteria}
              onClick={resetSearch}
            >
              {t("重置全部", "Reset all")}
            </button>
          </div>
        </section>

        {activeQuery && (
          <div className="browse-query-summary">
            <span>
              {t("当前描述：", "Current description: ")}
              {activeQuery}
            </span>
            <button
              type="button"
              className="browse-reset"
              onClick={() => updateParams({ q: "" })}
            >
              {t("移除描述条件", "Clear description")}
            </button>
          </div>
        )}
        {response && (
          <div
            className="browse-parsed"
            aria-label={t("已识别条件", "Parsed criteria")}
          >
            <span>
              {response.parser === "deepseek"
                ? t("AI 已识别", "AI understood")
                : t(
                    "已按关键词识别（未使用 AI）",
                    "Keyword matching used (not AI)",
                  )}
            </span>
            {response.filters.city && (
              <span className="tag">{response.filters.city}</span>
            )}
            {response.filters.maxRent && (
              <span className="tag">≤ €{response.filters.maxRent}</span>
            )}
            {response.filters.minRooms !== undefined && (
              <span className="tag">
                {response.filters.minRooms}+ {t("间", "rooms")}
              </span>
            )}
            {response.filters.furnished !== undefined && (
              <span className="tag">
                {response.filters.furnished
                  ? t("带家具", "Furnished")
                  : t("不带家具", "Unfurnished")}
              </span>
            )}
            {response.filters.keywords.map((keyword) => (
              <span className="tag" key={keyword}>
                {preferenceLabels[keyword]?.[en ? 1 : 0] ?? keyword}
              </span>
            ))}
          </div>
        )}
        {invalidQuery && (
          <p className="notice notice-warning" role="alert">
            {t(
              "请至少输入两个字符，或移除描述后直接浏览。",
              "Enter at least two characters, or clear the description to browse.",
            )}
          </p>
        )}
        {failed && (
          <div className="notice notice-warning" role="alert">
            <h2>{t("暂时无法读取房源", "We couldn't load these homes")}</h2>
            <p>
              {t(
                "请稍后重试，或移除描述条件后浏览房源。",
                "Please try again shortly, or clear your description to browse homes.",
              )}
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (activeQuery) {
                  setAttempt((value) => value + 1);
                } else window.location.reload();
              }}
            >
              {t("重试", "Try again")}
            </button>
            {activeQuery && (
              <button
                className="browse-reset"
                onClick={() => updateParams({ q: "" })}
              >
                {t("不用 AI，直接浏览", "Browse without AI")}
              </button>
            )}
          </div>
        )}

        <section
          className="browse-results"
          aria-labelledby="browse-results-title"
          aria-busy={busy}
        >
          <div className="browse-results-heading">
            <div>
              <h2 id="browse-results-title">
                {busy
                  ? t("正在查找房源…", "Finding homes…")
                  : failed || invalidQuery
                    ? t("房源结果", "Home results")
                    : t(
                        `${filtered.length} 套可申请房源`,
                        `${filtered.length} ${filtered.length === 1 ? "home" : "homes"} open for applications`,
                      )}
              </h2>
              <p role="status" aria-live="polite">
                {busy
                  ? t(
                      "请稍候，正在读取最新结果。",
                      "Please wait while we load your results.",
                    )
                  : !failed && !invalidQuery
                    ? t(
                        `当前显示 ${filtered.length} 套房源。`,
                        `Showing ${filtered.length} ${filtered.length === 1 ? "home" : "homes"}.`,
                      )
                    : t("结果暂不可用。", "Results are currently unavailable.")}
              </p>
            </div>
            <label className="browse-sort" htmlFor="browse-sort">
              {t("排序", "Sort by")}
              <select
                id="browse-sort"
                value={sort}
                onChange={(event) =>
                  updateParams({
                    sort:
                      event.target.value === "recommended"
                        ? ""
                        : event.target.value,
                  })
                }
              >
                <option value="recommended">
                  {response
                    ? t("匹配程度", "Best match")
                    : t("目录顺序", "Catalog order")}
                </option>
                <option value="rent-asc">
                  {t("月租从低到高", "Rent: low to high")}
                </option>
                <option value="rent-desc">
                  {t("月租从高到低", "Rent: high to low")}
                </option>
                <option value="available">
                  {t("最早可入住", "Earliest availability")}
                </option>
              </select>
            </label>
          </div>
          <p className="browse-inventory-note">
            {t(
              "日期依据发布者提供的最早入住日，实际空位须经房东审批确认。",
              "Dates reflect publisher-provided availability; the landlord confirms capacity when reviewing your application.",
            )}
          </p>
          {busy ? (
            <div className="homes-grid" aria-hidden="true">
              {[1, 2, 3].map((number) => (
                <div className="skeleton-card" key={number}>
                  <div />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : (
            !failed &&
            !invalidQuery && (
              <>
                {filtered.length ? (
                  <div className="homes-grid">
                    {filtered.map((result) => (
                      <ListingCard
                        key={result.listing.id}
                        listing={result.listing}
                        en={en}
                        reasons={
                          response
                            ? en
                              ? result.reasonsEN
                              : result.reasonsCN
                            : undefined
                        }
                        warnings={
                          response
                            ? en
                              ? result.warningsEN
                              : result.warningsCN
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Icon name="search" size={28} />
                    <h3>
                      {t(
                        "没有符合条件的已发布房源",
                        "No published homes match these criteria",
                      )}
                    </h3>
                    <p>
                      {t(
                        "试试其他城市、提高预算或移除描述条件。",
                        "Try another city, a higher budget or clear your description.",
                      )}
                    </p>
                    <button
                      className="btn btn-secondary"
                      disabled={!hasCriteria}
                      onClick={resetSearch}
                    >
                      {t("清除条件，查看全部", "Clear criteria and view all")}
                    </button>
                  </div>
                )}
              </>
            )
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
