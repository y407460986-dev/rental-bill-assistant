"use client";
import Link from "next/link";
import { useState } from "react";
import { formatAmount } from "@/lib/utils/currency";
import Icon from "./Icon";
export interface ChargeSummary {
  id: string;
  daysOccupied: number;
  netAmountDue: string;
  currency: string;
  confirmedAt: string | null;
  paymentAttempts: { status: string }[];
  billVersion: { servicePeriodStart: string; servicePeriodEnd: string };
}
export default function ChargesList({
  charges,
  en,
  loading,
  ready,
  onNavigate,
}: {
  charges: ChargeSummary[];
  en: boolean;
  loading: boolean;
  ready: boolean;
  onNavigate: (href: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const t = (zh: string, english: string) => (en ? english : zh);
  const isPaid = (c: ChargeSummary) =>
    c.paymentAttempts.some((a) => a.status === "COMPLETED");
  const paid = charges.filter(isPaid).length;
  const items = charges.filter(
    (c) => filter === "all" || (filter === "paid" ? isPaid(c) : !isPaid(c)),
  );
  return (
    <section data-od-id="my-charges">
      <p className="eyebrow">YOUR HOME, YOUR BILLS</p>
      <h1>{t("日常开销，心中有数。", "Your bills, all in one place.")}</h1>
      <p className="muted">
        {t(
          "查看已发布的费用，核对每笔分摊和付款记录。",
          "Review published charges, understand your share and check payment records.",
        )}
      </p>
      <div
        className="charge-filters"
        aria-label={t("按付款状态筛选", "Filter by payment status")}
      >
        {[
          ["all", t("全部", "All"), charges.length],
          ["unpaid", t("待支付", "Unpaid"), charges.length - paid],
          ["paid", t("已支付", "Paid"), paid],
        ].map(([key, label, count]) => (
          <button
            type="button"
            key={key}
            aria-pressed={filter === key}
            onClick={() => setFilter(String(key))}
            className="filter-tab"
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      {!loading && ready && !items.length && (
        <div className="empty-state">
          <Icon name="document" size={32} />
          <h3>{t("这里还没有账单", "No bills in this view")}</h3>
          <p>
            {t(
              "房东发布费用后，会显示在相应列表。",
              "Published charges will appear in the relevant list.",
            )}
          </p>
        </div>
      )}
      {items.map((c) => (
        <article className="charge-list-item" key={c.id}>
          <span className="charge-list-icon">
            <Icon name="document" size={22} />
          </span>
          <div>
            <Link
              href={"/tenant/charges/" + c.id}
              onNavigate={() => onNavigate("/tenant/charges/" + c.id)}
            >
              <h3>{t("电费账单", "Electricity statement")}</h3>
            </Link>
            <p>
              {c.billVersion.servicePeriodStart?.slice(0, 10)} →{" "}
              {c.billVersion.servicePeriodEnd?.slice(0, 10)} · {c.daysOccupied}{" "}
              {t("天", "days")}
            </p>
          </div>
          <Link
            className="charge-list-price"
            href={"/tenant/charges/" + c.id}
            onNavigate={() => onNavigate("/tenant/charges/" + c.id)}
          >
            {c.currency}{" "}
            {formatAmount(c.netAmountDue, c.currency, en ? "en-US" : "de-DE")}
            <span>
              {isPaid(c)
                ? t("已支付 · 查看明细", "Paid · View details")
                : t("待支付 · 查看明细", "Unpaid · View details")}
            </span>
          </Link>
        </article>
      ))}
    </section>
  );
}
