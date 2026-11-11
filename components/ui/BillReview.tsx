import { formatAmount } from "@/lib/utils/currency";
import { splitReviewRemarks } from "@/lib/contracts/review-remarks";
import { statusLabel } from "./statusLabel";
import { billingIssueLabel } from "./billingIssueLabel";
export interface Version {
  id: string;
  status: string;
  currency: string;
  inputFingerprint: string;
  reconciliationIssues: string[];
  extractedLineItems: Record<string, unknown>;
  snapshot?: {
    audit?: {
      manual?: {
        start: string;
        end: string;
        note: string;
        userId: string;
        at: string;
        settlement?: {
          supplierAdvancePaidPreviously: true;
          lineItemsReferenceOnly: true;
          acknowledgedIssues: string[];
        };
      };
    };
    reconciliation?: { ignoredIssues?: string[] };
  };
  charges: {
    id: string;
    tenantId: string;
    tenancy?: { tenant: { name: string } };
    daysOccupied: number;
    actualShare: string;
  }[];
}
export interface Bill {
  id: string;
  sourceDocument: { isSynthetic: boolean };
  processing: {
    status: string;
    errorCode: string | null;
    leaseUntil: string | null;
  } | null;
  versions: Version[];
}

interface Props {
  bill: Bill;
  id?: string;
  en: boolean;
  v?: Version;
  busy: boolean;
  processing: boolean;
  leaseActive: boolean;
  canProcess: boolean;
  run: (action: (generation: number) => Promise<void>) => Promise<void>;
  processAndReload: (billId: string, generation: number) => Promise<void>;
  mutateAndReload: (
    path: string,
    body: unknown,
    generation: number,
  ) => Promise<void>;
}
export default function BillReview({
  bill,
  id,
  en,
  v,
  busy,
  processing,
  leaseActive,
  canProcess,
  run,
  processAndReload,
  mutateAndReload,
}: Props) {
  const t = (zh: string, english: string) => (en ? english : zh);
  const extracted = v?.extractedLineItems;
  const extractedRemarks = splitReviewRemarks(
    Array.isArray(extracted?.issues) ? extracted.issues : [],
    Array.isArray(extracted?.notes) ? extracted.notes : [],
  );
  const { issues, notes } = splitReviewRemarks(
    v?.reconciliationIssues ?? [],
    extractedRemarks.notes,
  );
  return (
    <section className="workspace-section" data-od-id="bill-review">
      <h1>{t("水电账单复核", "Review your utility bill")}</h1>
      <p>
        {statusLabel(bill.processing?.status, en)} ·{" "}
        {v
          ? statusLabel(v.status, en)
          : bill.processing?.status === "FAILED"
            ? t(
                "未保存提取结果，请重试处理",
                "No extraction saved. Retry processing.",
              )
            : t("尚未保存提取结果", "No extraction saved yet")}
      </p>
      <a rel="noopener noreferrer" target="_blank" href={"/api/evidence/" + id}>
        {t("查看留存凭证", "View saved document")}
      </a>
      <details className="muted">
        <summary>{t("凭证来源详情", "Statement source details")}</summary>
        <p>
          {bill.sourceDocument.isSynthetic
            ? t(
                "此凭证带有非正式用途标记，不是供应商出具的正式账单。",
                "This document is marked for non-production use, not as an actual supplier statement.",
              )
            : t("用户上传的电费凭证。", "User-uploaded electricity statement.")}
        </p>
      </details>
      {bill.processing?.errorCode && (
        <aside>
          <p>{billingIssueLabel(bill.processing.errorCode, en)}</p>
          <details className="muted">
            <summary>
              {t("处理技术详情", "Technical processing details")}
            </summary>
            {bill.processing.errorCode}
          </details>
        </aside>
      )}
      {processing && (
        <p role="status">
          {leaseActive
            ? t(
                "账单正在处理中，请稍后刷新状态。",
                "Bill processing is in progress. Refresh the status shortly.",
              )
            : t(
                "上次处理已中断，可以重新尝试。",
                "The previous processing attempt stopped. You can try again.",
              )}
        </p>
      )}
      <button
        disabled={busy || !canProcess}
        onClick={() =>
          run(async (generation) => {
            await processAndReload(bill.id, generation);
          })
        }
      >
        {bill.processing?.status === "QUEUED"
          ? t("开始处理", "Start processing")
          : t("重试处理", "Retry processing")}
      </button>
      {v && (
        <>
          <h2>{t("账单字段与依据", "Statement details and evidence")}</h2>
          <dl className="grid">
            {[
              ["settlementTotal", t("结算总额", "Statement total")],
              [
                "advancePayments",
                t("供应商已收预付款", "Supplier advance payments"),
              ],
              ["amountDue", t("供应商补缴余额", "Supplier balance")],
              ["nextPeriodAdvance", t("下一期预付款", "Next-period advance")],
              [
                "servicePeriodStart",
                v.snapshot?.audit?.manual
                  ? t("服务开始日（用户补充）", "Service start (user-supplied)")
                  : t("服务开始日", "Service start"),
              ],
              [
                "servicePeriodEnd",
                v.snapshot?.audit?.manual
                  ? t(
                      "服务结束日（不含，用户补充）",
                      "Service end (exclusive; user-supplied)",
                    )
                  : t("服务结束日（不含）", "Service end (exclusive)"),
              ],
            ].map(([field, label]) => (
              <div key={field}>
                <dt>{label}</dt>
                <dd>
                  {v.extractedLineItems?.[field] == null
                    ? t("未识别", "Missing")
                    : field.startsWith("servicePeriod")
                      ? String(v.extractedLineItems[field])
                      : formatAmount(
                          String(v.extractedLineItems[field]),
                          v.currency,
                          en ? "en-US" : "de-DE",
                        )}
                </dd>
              </div>
            ))}
          </dl>
          <details>
            <summary>{t("查看原文引用", "Source references")}</summary>
            {Array.isArray(v.extractedLineItems?.evidence) &&
              v.extractedLineItems.evidence.map(
                (
                  item: {
                    field: string;
                    rawText: string;
                    page: number;
                    region: string;
                  },
                  i: number,
                ) => (
                  <p key={i}>
                    {item.rawText} · {item.region}
                  </p>
                ),
              )}
          </details>
          {notes.length > 0 && (
            <aside className="muted">
              <strong>
                {t("账单说明（不阻止发布）", "Statement notes (not blocking)")}
              </strong>
              <ul>
                {notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </aside>
          )}
          {issues.length > 0 && (
            <aside>
              <strong>
                {t("待核对，无法发布", "Review required; publishing blocked")}
              </strong>
              <ul>
                {issues.map((issue, i) => (
                  <li key={i}>{billingIssueLabel(issue, en)}</li>
                ))}
              </ul>
              <details className="muted">
                <summary>
                  {t("核对技术详情", "Technical review details")}
                </summary>
                <ul>
                  {issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </details>
            </aside>
          )}
          {(v.status === "READY" || v.status === "PUBLISHED") &&
            v.snapshot?.audit?.manual && (
              <aside>
                <h3>
                  {t(
                    "用户补充的账期与结算约定（非原件提取）",
                    "User-supplied dates and settlement terms (not extracted)",
                  )}
                </h3>
                <p>
                  {v.snapshot.audit.manual.start} –{" "}
                  {v.snapshot.audit.manual.end}{" "}
                  {t("（结束日不含）", "(end exclusive)")}
                </p>
                <p>{v.snapshot.audit.manual.note}</p>
                <details className="muted">
                  <summary>
                    {t("补充记录审计", "Supplement audit details")}
                  </summary>
                  <p>
                    {t("操作人标识：", "Recorded by: ")}
                    {v.snapshot.audit.manual.userId}
                  </p>
                  <p>
                    {t("记录时间：", "Recorded at: ")}
                    {v.snapshot.audit.manual.at}
                  </p>
                </details>
                {v.snapshot.audit.manual.settlement && (
                  <p>
                    {t(
                      "按补充协议：供应商预付款已另行支付；仅分摊本次补缴余额，排除下期预付款；明细仅供参考，已确认差异。",
                      "Under the supplemental agreement: supplier advances were paid previously; allocate only the amount due, excluding the next-period advance. Detail lines are reference-only and discrepancies are acknowledged.",
                    )}
                  </p>
                )}
              </aside>
            )}
          {(v.status === "READY" || v.status === "PUBLISHED") &&
            Boolean(v.snapshot?.reconciliation?.ignoredIssues?.length) && (
              <aside>
                <strong>
                  {t(
                    "补充协议已确认的原始警告（不阻止发布）",
                    "Original warnings acknowledged by supplemental agreement (not blocking)",
                  )}
                </strong>
                <ul>
                  {v.snapshot?.reconciliation?.ignoredIssues?.map(
                    (issue, i) => (
                      <li key={i}>{billingIssueLabel(issue, en)}</li>
                    ),
                  )}
                </ul>
                <details className="muted">
                  <summary>
                    {t("原始警告详情", "Original warning details")}
                  </summary>
                  <ul>
                    {v.snapshot?.reconciliation?.ignoredIssues?.map(
                      (issue, i) => (
                        <li key={i}>{issue}</li>
                      ),
                    )}
                  </ul>
                </details>
              </aside>
            )}
          {v.status !== "PUBLISHED" && (
            <details>
              <summary>
                {t(
                  "补充服务账期与结算约定",
                  "Add service dates and settlement terms",
                )}
              </summary>
              <form
                method="post"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  run(async (generation) => {
                    await mutateAndReload(
                      "/api/organizer/bills/" + id + "/review",
                      {
                        versionId: v.id,
                        start: form.get("start"),
                        end: form.get("end"),
                        note: form.get("note"),
                        ...(form.get("settlement") === "on"
                          ? {
                              settlement: {
                                supplierAdvancePaidPreviously: true,
                                lineItemsReferenceOnly: true,
                                acknowledgedIssues: [
                                  ...new Set([
                                    ...v.reconciliationIssues,
                                    ...(v.snapshot?.reconciliation
                                      ?.ignoredIssues ?? []),
                                  ]),
                                ],
                              },
                            }
                          : {}),
                      },
                      generation,
                    );
                  });
                }}
              >
                <label>
                  {t(
                    "服务开始日（用户补充，非原件提取）",
                    "Service start (user-supplied; not extracted)",
                  )}
                  <input name="start" type="date" required />
                </label>
                <label>
                  {t(
                    "服务结束日（不含，用户补充，非原件提取）",
                    "Service end (exclusive; user-supplied; not extracted)",
                  )}
                  <input name="end" type="date" required />
                </label>
                <label>
                  {t("资料来源与补充依据", "Source and reason for correction")}
                  <input name="note" minLength={5} required />
                </label>
                <label>
                  <input name="settlement" type="checkbox" />
                  {t(
                    "我明确确认本次补充结算约定：供应商预付款 ",
                    "I explicitly confirm these supplemental settlement terms: supplier advances of ",
                  )}
                  {String(
                    v.extractedLineItems.advancePayments ??
                      t("未识别", "Missing"),
                  )}{" "}
                  EUR
                  {t(
                    " 已另行支付；仅分摊本次补缴余额 ",
                    " were paid previously; allocate only the amount due of ",
                  )}
                  {String(
                    v.extractedLineItems.amountDue ?? t("未识别", "Missing"),
                  )}{" "}
                  EUR
                  {t(
                    "，排除下一期预付款 ",
                    ", excluding the next-period advance of ",
                  )}
                  {String(
                    v.extractedLineItems.nextPeriodAdvance ??
                      t("未识别", "Missing"),
                  )}{" "}
                  EUR
                  {t(
                    "。明细仅供参考；我确认上列所有核对差异。此协议不修改原始提取结果或全局规则。",
                    ". Detail lines are reference-only; I acknowledge all reconciliation discrepancies listed above. This agreement does not change the original extraction or global policy.",
                  )}
                </label>
                <button disabled={busy || processing}>
                  {t("保存新版本并核对", "Save new version and review")}
                </button>
              </form>
            </details>
          )}
          <h2>
            {v.status === "PUBLISHED"
              ? t("已发布的个人费用", "Published individual charges")
              : t("逐人收费草稿", "Individual charge draft")}
          </h2>
          <table>
            <thead>
              <tr>
                <th>{t("租客", "Tenant")}</th>
                <th>{t("天数", "Days")}</th>
                <th>EUR</th>
              </tr>
            </thead>
            <tbody>
              {v.charges.map((c) => (
                <tr key={c.id}>
                  <td>{c.tenancy?.tenant.name || t("租客", "Tenant")}</td>
                  <td>{c.daysOccupied}</td>
                  <td>
                    {formatAmount(
                      c.actualShare,
                      v.currency,
                      en ? "en-US" : "de-DE",
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(v.status === "DRAFT" || v.status === "READY") &&
            issues.length === 0 && (
              <button
                disabled={busy || leaseActive}
                onClick={() =>
                  run(async (generation) => {
                    await mutateAndReload(
                      "/api/organizer/bills/" + id + "/generate",
                      {},
                      generation,
                    );
                  })
                }
              >
                {v.status === "READY"
                  ? t(
                      "从已保存的提取结果重新生成费用",
                      "Regenerate charges from saved extraction",
                    )
                  : t(
                      "从已保存的提取结果生成费用",
                      "Generate charges from saved extraction",
                    )}
              </button>
            )}
          <button
            disabled={
              busy || processing || v.status !== "READY" || issues.length > 0
            }
            onClick={() =>
              run(async (generation) => {
                await mutateAndReload(
                  "/api/organizer/bills/" + id + "/publish",
                  {
                    versionId: v.id,
                    fingerprint: v.inputFingerprint,
                    key: "publish-" + v.id,
                  },
                  generation,
                );
              })
            }
          >
            {t("确认并发布", "Confirm and publish")}
          </button>
        </>
      )}
    </section>
  );
}
