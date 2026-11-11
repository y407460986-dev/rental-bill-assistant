import type { ReactNode } from "react";
import { formatAmount } from "@/lib/utils/currency";
import Icon from "./Icon";
import { PageIntro } from "./SiteShell";
export interface ChargeView {
  id: string;
  daysOccupied: number;
  actualShare: string;
  netAmountDue: string;
  creditApplied: string;
  confirmedAt: string | null;
  paid: boolean;
  billId: string;
  explanationCN: string;
  explanationEN: string;
  currency: string;
  synthetic: boolean;
  servicePeriodStart: string;
  servicePeriodEnd: string;
}
export function paymentLabel(status: string, en: boolean) {
  const labels: Record<string, [string, string]> = {
    COMPLETED: ["已支付", "Paid"],
    PENDING: ["等待付款结果", "Payment pending"],
    APPROVED: ["已授权，正在完成付款", "Authorized; completing payment"],
    CREATED: ["等待付款授权", "Awaiting payment authorization"],
    SAVED: ["等待付款授权", "Awaiting payment authorization"],
    PAYER_ACTION_REQUIRED: ["等待付款授权", "Awaiting payment authorization"],
    UNPAID: ["待支付", "Unpaid"],
    CANCELLED: ["已取消", "Cancelled"],
    FAILED: ["付款未完成", "Payment incomplete"],
    UNKNOWN: ["正在核实状态", "Checking payment status"],
    ORDER_NOT_CREATED: ["尚未创建付款", "Payment not started"],
    NONE: ["待支付", "Unpaid"],
  };
  return (
    labels[status]?.[en ? 1 : 0] || (en ? "Awaiting confirmation" : "待确认")
  );
}
export default function ChargeDetail({
  charge: c,
  en,
  payment,
  children,
  preview = false,
}: {
  charge: ChargeView;
  en: boolean;
  payment: string;
  children?: ReactNode;
  preview?: boolean;
}) {
  const t = (zh: string, english: string) => (en ? english : zh);
  const paid = c.paid || payment === "COMPLETED";
  return (
    <section data-od-id="charge-detail">
      <PageIntro
        eyebrow="YOUR HOME, YOUR BILLS"
        title={t("每一笔，都看得明白。", "Every share, explained.")}
        description={t("电费账单 · EUR", "Electricity statement · EUR")}
      />
      <div className="charge-layout">
        <div className="charge-main">
          <h2>{t("这笔费用从哪里来", "Understanding your bill")}</h2>
          <dl className="charge-details">
            <div>
              <dt>{t("服务账期", "Service period")}</dt>
              <dd className="num">
                {c.servicePeriodStart?.slice(0, 10)} →{" "}
                {c.servicePeriodEnd?.slice(0, 10)}
                <small>{t("结束日不包含", "End date excluded")}</small>
              </dd>
            </div>
            <div>
              <dt>{t("本期有效入住", "Your occupancy")}</dt>
              <dd>
                {c.daysOccupied} {t("天", "days")}
              </dd>
            </div>
          </dl>
          <h3>{t("你的分摊依据", "How your share is calculated")}</h3>
          <p className="explanation">
            {en ? c.explanationEN : c.explanationCN}
          </p>
          {preview ? (
            <div className="evidence-link">
              <Icon name="document" />
              <span>
                {t("原始凭证区域", "Source evidence area")}
                <small>
                  {t(
                    "设计样例，不关联真实凭证",
                    "Design sample; no real document attached",
                  )}
                </small>
              </span>
            </div>
          ) : (
            <a
              className="evidence-link"
              target="_blank"
              rel="noopener noreferrer"
              href={"/api/evidence/" + c.billId}
            >
              <Icon name="document" />
              <span>
                {c.synthetic
                  ? t("查看留存凭证", "View saved document")
                  : t("查看原始账单", "View original statement")}
                <small>
                  {t(
                    "打开私有凭证，核对原文和金额",
                    "Open the private evidence to review source details",
                  )}
                </small>
              </span>
              <Icon name="arrow" size={18} />
            </a>
          )}
          {c.synthetic && (
            <details className="muted">
              <summary>{t("凭证来源详情", "Statement source details")}</summary>
              <p>
                {t(
                  "此凭证带有非正式用途标记，不是供应商出具的正式账单。留存记录用于核对本笔费用的历史依据。",
                  "This document is marked for non-production use, not as an actual supplier statement. It is retained as the historical basis for this charge.",
                )}
              </p>
            </details>
          )}
          <p
            className="muted"
            style={{ fontSize: 11, marginTop: 18, marginBottom: 0 }}
          >
            {t(
              "费用依据已确认的入住记录与分摊规则计算。请先核对，再确认付款。",
              "Your share follows the agreed occupancy and allocation rules. Review the evidence before paying.",
            )}
          </p>
        </div>
        <div className="charge-summary">
          <p className="eyebrow">
            {paid
              ? t("本期账单金额", "STATEMENT AMOUNT")
              : t("本期应付金额", "YOUR AMOUNT DUE")}
          </p>
          <span className={"status-pill " + (paid ? "status-paid" : "")}>
            {paid && <Icon name="check" size={13} />}{" "}
            {paid ? t("已支付", "Paid") : paymentLabel(payment, en)}
          </span>
          <div className="charge-amount">
            <small>{c.currency}</small>
            {formatAmount(c.netAmountDue, c.currency, en ? "en-US" : "de-DE")}
          </div>
          <div className="summary-row">
            <span>{t("个人分摊", "Allocated share")}</span>
            <strong>
              {c.currency}{" "}
              {formatAmount(c.actualShare, c.currency, en ? "en-US" : "de-DE")}
            </strong>
          </div>
          <div className="summary-row">
            <span>{t("已付抵扣", "Credits applied")}</span>
            <strong>
              {c.currency}{" "}
              {formatAmount(
                c.creditApplied,
                c.currency,
                en ? "en-US" : "de-DE",
              )}
            </strong>
          </div>
          <div className="summary-row">
            <span>{t("费用确认", "Charge confirmation")}</span>
            <strong>
              {c.confirmedAt
                ? t("已确认", "Confirmed")
                : t("待你核对", "Awaiting your review")}
            </strong>
          </div>
          {paid ? (
            <p className="paid-message">
              <Icon name="shield" size={20} />
              {preview
                ? t(
                    "模拟已支付状态，仅用于设计预览。",
                    "Simulated paid state for design review only.",
                  )
                : t("付款已由服务端核实。", "Payment verified by the server.")}
            </p>
          ) : (
            children
          )}
          <p className="payment-help">
            {paid
              ? t(
                  "付款已完成，无需再次支付。",
                  "Payment is complete. No further payment is needed.",
                )
              : payment === "APPROVED" ||
                  payment === "PENDING" ||
                  payment === "UNKNOWN"
                ? t(
                    "正在核实付款结果，请勿重复付款。最终状态以核验结果为准。",
                    "Your payment result is being checked. Do not pay again; the verified result determines the final status.",
                  )
                : t(
                    "通过 PayPal 安全付款，付款结果经核实后更新。",
                    "Pay securely with PayPal. Your payment status updates after verification.",
                  )}
          </p>
          <details className="payment-help">
            <summary>{t("付款服务说明", "Payment service details")}</summary>
            <p>
              {t(
                "付款使用 PayPal Sandbox 测试环境，不扣真实资金。",
                "Payments use the PayPal Sandbox testing environment; no real funds are charged.",
              )}
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
