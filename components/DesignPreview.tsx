"use client";
import Link from "next/link";
import { useState } from "react";
import ChargeDetail, { type ChargeView } from "./ui/ChargeDetail";
import { SiteFooter } from "./ui/SiteShell";
import { SessionHeader } from "./ui/RentalFrame";
import { useLanguage } from "./ui/useLanguage";
const sample: ChargeView = {
  id: "design-sample",
  billId: "design-sample",
  daysOccupied: 30,
  actualShare: "72.00",
  netAmountDue: "72.00",
  creditApplied: "0.00",
  confirmedAt: null,
  paid: false,
  currency: "EUR",
  synthetic: true,
  servicePeriodStart: "2026-09-01",
  servicePeriodEnd: "2026-10-01",
  explanationCN:
    "设计样例：模拟账单总额 EUR 180.00。三位租客分别入住 30、30、15 天，总计 75 人天。按已约定的人天比例，个人份额为 180.00 × 30 ÷ 75 = EUR 72.00。这不是实际应付账单。",
  explanationEN:
    "Design sample: a synthetic EUR 180.00 bill, with 30, 30 and 15 occupied days (75 person-days total). Under the agreed rule, your share is 180.00 × 30 ÷ 75 = EUR 72.00. This is not an actual charge.",
};
export default function DesignPreview() {
  const { en, t } = useLanguage();
  const [state, setState] = useState("review");
  return (
    <>
      <SessionHeader />
      <div className="preview-banner">
        {t(
          "设计预览 · 以下数据全部为模拟，不会写入账单或发起支付",
          "Design preview · all data below is simulated; no records or payments are created",
        )}
      </div>
      <main className="workspace container" id="content">
        <nav
          className="workspace-toolbar"
          aria-label={t("设计页面预览", "Design previews")}
        >
          <div>
            <Link href="/">{t("首页", "Homepage")}</Link>
            <Link href="/search">{t("找房页", "Home search")}</Link>
            <Link href="/login">{t("登录页", "Sign in")}</Link>
          </div>
          <label>
            {t("样例状态", "Sample state")}
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="review">{t("待核对", "Awaiting review")}</option>
              <option value="confirmed">{t("待支付", "Ready to pay")}</option>
              <option value="paid">
                {t("已支付（模拟）", "Paid (simulated)")}
              </option>
              <option value="cancelled">{t("已取消", "Cancelled")}</option>
            </select>
          </label>
        </nav>
        <ChargeDetail
          charge={{
            ...sample,
            confirmedAt: state === "review" ? null : "2026-10-01",
            paid: state === "paid",
          }}
          en={en}
          payment={
            state === "paid"
              ? "COMPLETED"
              : state === "cancelled"
                ? "CANCELLED"
                : "NONE"
          }
          preview
        >
          <div className="actions">
            <button disabled>
              {t("确认费用（仅预览）", "Confirm charge (preview only)")}
            </button>
            <button disabled>
              {t("PayPal Sandbox（仅预览）", "PayPal Sandbox (preview only)")}
            </button>
          </div>
        </ChargeDetail>
      </main>
      <SiteFooter />
    </>
  );
}
