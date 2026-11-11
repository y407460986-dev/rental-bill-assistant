"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { RentalFrame, RentalError } from "./ui/RentalFrame";
import { useRemote, rentalRequest } from "./ui/useRemote";
import { useLanguage } from "./ui/useLanguage";

interface Application {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  requestedStartDate: string;
  requestedEndDate: string | null;
  agreement: { termsCN?: string; termsEN?: string } | null;
  tenant: { name: string };
  property: { id: string; title: string; isDemo: boolean };
  room: { name: string; capacity: number } | null;
  tenancy: {
    id: string;
    billingStartDate: string;
    billingEndDate: string | null;
    confirmations: { userId: string; policyVersionId: string }[];
  } | null;
}

export default function Applications() {
  const { en, t } = useLanguage();
  const remote = useRemote<Application[]>("/api/rental/applications");
  const who = useRemote<{ role: string }>("/api/auth/me");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState<"" | "approve" | "reject" | "cancel">(
    "",
  );
  const running = useRef(false);
  const landlord = who.data?.role === "LANDLORD";
  const tenant = who.data?.role === "TENANT";
  const loading = remote.loading || who.loading;
  const ready = !loading && !who.error && !remote.error && (landlord || tenant);
  const applications = (remote.data ?? []).filter(
    (application) => !application.property.isDemo,
  );
  const statusLabels = {
    PENDING: landlord
      ? t("待审批", "Needs review")
      : t("待房东确认", "Awaiting landlord"),
    APPROVED: t("已批准", "Approved"),
    REJECTED: t("已拒绝", "Rejected"),
    CANCELLED: t("已取消", "Cancelled"),
  };
  const notices = {
    approve: t(
      "申请已批准。入住日期与费用约定已保存；批准不代表已付款。",
      "Application approved. Occupancy dates and terms are saved; approval does not mean payment.",
    ),
    reject: t(
      "申请已拒绝，没有建立入住或收费记录。",
      "Application rejected. No occupancy or charge was created.",
    ),
    cancel: t(
      "申请已取消，没有建立入住或收费记录。",
      "Application cancelled. No occupancy or charge was created.",
    ),
  };
  const stages = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
  const items = stages.flatMap((stage) =>
    applications.filter(
      (application) =>
        application.status === stage && (filter === "all" || filter === stage),
    ),
  );
  const pendingCount = applications.filter(
    (application) => application.status === "PENDING",
  ).length;

  async function reload() {
    if (running.current) return;
    setError("");
    await Promise.all([who.reload(), remote.reload()]);
  }

  async function decide(id: string, decision: "approve" | "reject" | "cancel") {
    if (
      running.current ||
      !ready ||
      (landlord ? decision === "cancel" : decision !== "cancel")
    )
      return;
    running.current = true;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await rentalRequest("/api/rental/applications/" + id, { decision });
      setMessage(decision);
      await remote.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
      await remote.reload();
    } finally {
      setBusy("");
      running.current = false;
    }
  }

  return (
    <RentalFrame active="applications">
      <header className="application-heading">
        <div>
          <p className="eyebrow">{t("申请与入住", "APPLICATIONS & STAYS")}</p>
          <h1>
            {landlord
              ? t("租客申请", "Rental applications")
              : tenant
                ? t("我的申请", "My applications")
                : t("入住申请", "Applications")}
          </h1>
          <p className="muted">
            {landlord
              ? t(
                  "先核对日期与费用约定，再为租客确认入住。",
                  "Review dates and utility terms before confirming a tenant’s stay.",
                )
              : tenant
                ? t(
                    "从提交申请到确认入住，每一步都在这里。",
                    "Follow each step, from your application to an approved stay.",
                  )
                : t(
                    "登录后查看申请进度与入住安排。",
                    "Sign in to view applications and occupancy details.",
                  )}
          </p>
        </div>
        {!who.loading && (landlord || tenant) && (
          <Link
            className="btn btn-secondary"
            href={landlord ? "/organizer/listings" : "/search"}
          >
            {landlord
              ? t("管理房源", "Manage listings")
              : t("继续找房", "Find more homes")}
          </Link>
        )}
      </header>
      <RentalError error={who.error || remote.error || error} retry={reload} />
      {message && (
        <p role="status" className="notice">
          {notices[message]}
        </p>
      )}
      {loading && (
        <p role="status" className="application-loading">
          {t("正在读取账号与申请…", "Loading your account and applications…")}
        </p>
      )}
      {!loading && who.data && !landlord && !tenant && (
        <div className="empty-state">
          <h2>
            {t(
              "当前账号无法管理租房申请",
              "This account cannot manage rental applications",
            )}
          </h2>
          <Link href="/search">{t("浏览房源", "Browse homes")}</Link>
        </div>
      )}
      {ready && (
        <>
          <div
            className="application-filters"
            role="group"
            aria-label={t("按申请状态筛选", "Filter applications by stage")}
          >
            <button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              {t("全部", "All")} <span>{applications.length}</span>
            </button>
            {stages.map((stage) => (
              <button
                key={stage}
                aria-pressed={filter === stage}
                onClick={() => setFilter(stage)}
              >
                {statusLabels[stage]}{" "}
                <span>
                  {
                    applications.filter(
                      (application) => application.status === stage,
                    ).length
                  }
                </span>
              </button>
            ))}
            <button
              className="application-refresh"
              disabled={!!busy}
              onClick={reload}
            >
              {t("刷新", "Refresh")}
            </button>
          </div>
          {pendingCount > 0 && (filter === "all" || filter === "PENDING") && (
            <aside className="application-priority">
              <strong>
                {landlord
                  ? t(
                      `${pendingCount} 份申请等待你审批`,
                      `${pendingCount} applications need your review`,
                    )
                  : t(
                      `${pendingCount} 份申请等待房东确认`,
                      `${pendingCount} applications await the landlord`,
                    )}
              </strong>
              <p>
                {landlord
                  ? t(
                      "待审批申请优先显示。批准前请确认房间、入住日期与费用约定。",
                      "Pending applications appear first. Check the room, dates and terms before approving.",
                    )
                  : t(
                      "暂时无需付款。房东批准后，这里会显示确认的入住记录。",
                      "No payment is due from applying. Your confirmed occupancy will appear here after approval.",
                    )}
              </p>
            </aside>
          )}
          <p className="application-result-count" role="status">
            {t(
              `显示 ${items.length} 份申请`,
              `${items.length} applications in this view`,
            )}
          </p>
          {!items.length && (
            <div className="empty-state">
              <h2>
                {applications.length
                  ? t("暂无此阶段的申请", "No applications at this stage")
                  : landlord
                    ? t(
                        "等待你的第一份申请",
                        "Ready for your first application",
                      )
                    : t(
                        "你的下一个住处，从这里开始",
                        "Your next home starts here",
                      )}
              </h2>
              <p>
                {applications.length
                  ? t(
                      "切换筛选条件，查看其他申请。",
                      "Switch filters to see your other applications.",
                    )
                  : landlord
                    ? t(
                        "发布房源后，租客提交的申请会显示在这里。",
                        "Publish a listing and tenant applications will appear here.",
                      )
                    : t(
                        "找到合适的房源，选择入住日期并确认费用约定后提交申请。",
                        "Find a home, choose your dates and accept the utility terms to apply.",
                      )}
              </p>
              {applications.length ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => setFilter("all")}
                >
                  {t("查看全部申请", "Show all applications")}
                </button>
              ) : (
                <Link
                  className="btn btn-primary"
                  href={landlord ? "/organizer/listings" : "/search"}
                >
                  {landlord
                    ? t("管理并发布房源", "Manage & publish listings")
                    : t("寻找住处", "Find a home")}
                </Link>
              )}
            </div>
          )}
          <div className="application-list">
            {items.map((application) => (
              <article
                className={`application-card${application.status === "PENDING" ? " application-card-pending" : ""}`}
                key={application.id}
              >
                <div className="application-card-heading">
                  <div>
                    <div className="application-tags">
                      <span
                        className={`application-status application-status-${application.status.toLowerCase()}`}
                      >
                        {statusLabels[application.status]}
                      </span>
                    </div>
                    <h2>{application.property.title}</h2>
                    {landlord && (
                      <p className="application-applicant">
                        {t("申请人：", "Applicant: ")}
                        {application.tenant.name}
                      </p>
                    )}
                  </div>
                  <span className="tag">
                    {application.room?.name ?? t("整套出租", "Entire home")}
                  </span>
                </div>
                <dl className="application-facts">
                  <div>
                    <dt>
                      {application.tenancy
                        ? t("确认入住日", "Confirmed start")
                        : t("申请入住日", "Requested start")}
                    </dt>
                    <dd>
                      {(
                        application.tenancy?.billingStartDate ??
                        application.requestedStartDate
                      ).slice(0, 10)}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {application.tenancy
                        ? t("确认结束日（不含）", "Confirmed end (exclusive)")
                        : t("申请结束日（不含）", "Requested end (exclusive)")}
                    </dt>
                    <dd>
                      {(application.tenancy
                        ? application.tenancy.billingEndDate
                        : application.requestedEndDate
                      )?.slice(0, 10) ?? t("持续入住", "Ongoing stay")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("入住范围", "Occupancy")}</dt>
                    <dd>
                      {application.room
                        ? `${application.room.name} · ${t(`容量 ${application.room.capacity} 人`, `capacity ${application.room.capacity}`)}`
                        : t("整套房屋", "Entire home")}
                    </dd>
                  </div>
                </dl>
                <details
                  className="application-terms"
                  open={application.status === "PENDING" && landlord}
                >
                  <summary>
                    {t(
                      "申请时确认的费用约定",
                      "Utility terms accepted on application",
                    )}
                  </summary>
                  <p>
                    {(en
                      ? application.agreement?.termsEN
                      : application.agreement?.termsCN) ??
                      (application.tenancy
                        ? t(
                            "历史入住沿用原已确认的费用规则。",
                            "Existing occupancy follows its previously confirmed utility terms.",
                          )
                        : t(
                            "此申请未提供可显示的费用约定。",
                            "No utility terms are available for this application.",
                          ))}
                  </p>
                  {application.tenancy && (
                    <p className="muted">
                      {t("原申请日期：", "Originally requested: ")}
                      {application.requestedStartDate.slice(0, 10)} –{" "}
                      {application.requestedEndDate?.slice(0, 10) ??
                        t("持续入住", "Ongoing stay")}
                      {t("（结束日不包含）", " (end exclusive)")}
                    </p>
                  )}
                </details>
                {application.tenancy && (
                  <div className="application-next-step">
                    <div>
                      <strong>
                        {t("入住记录已建立", "Occupancy confirmed")}
                      </strong>
                      <p>
                        {t(
                          "入住日期与费用规则确认记录已保存。批准不表示已付租金或水电费。",
                          "Occupancy dates and rule confirmations are saved. Approval does not mean rent or utilities are paid.",
                        )}
                      </p>
                    </div>
                    <Link
                      className="btn btn-secondary"
                      href={
                        landlord ? "/organizer/bills/new" : "/tenant/charges"
                      }
                    >
                      {landlord
                        ? t("前往水电账单", "Continue to utility bills")
                        : t("查看我的账单", "View my bills")}
                    </Link>
                  </div>
                )}
                {application.status === "APPROVED" && !application.tenancy && (
                  <div className="application-next-step">
                    <p>
                      {t(
                        "申请已批准，但当前未返回入住记录。请重新读取后查看入住安排。",
                        "Approved, but occupancy details were not returned. Reload to check the stay.",
                      )}
                    </p>
                    <button
                      className="btn btn-secondary"
                      disabled={!!busy}
                      onClick={reload}
                    >
                      {t("重新读取", "Reload")}
                    </button>
                  </div>
                )}
                {application.status === "PENDING" && (
                  <div className="application-decision">
                    {landlord ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void decide(application.id, "approve");
                        }}
                      >
                        {!application.agreement && (
                          <p className="notice notice-warning">
                            {t(
                              "此申请缺少费用约定，暂不能批准。租客需要按当前房源约定重新申请。",
                              "This application has no utility agreement and cannot be approved. The tenant needs to reapply under the current listing terms.",
                            )}
                          </p>
                        )}
                        <label className="application-check">
                          <input
                            type="checkbox"
                            required
                            disabled={!!busy || !application.agreement}
                          />
                          {t(
                            "我确认上述入住日期与费用约定，并批准建立入住记录。",
                            "I confirm these dates and terms and approve creating the occupancy record.",
                          )}
                        </label>
                        <div className="application-actions">
                          <button
                            className="btn btn-primary"
                            disabled={!!busy || !application.agreement}
                          >
                            {busy === application.id
                              ? t("处理中…", "Processing…")
                              : t("确认并批准", "Confirm & approve")}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={!!busy}
                            onClick={() =>
                              void decide(application.id, "reject")
                            }
                          >
                            {t("拒绝申请", "Reject application")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="application-next-step">
                        <p>
                          {t(
                            "下一步：等待房东审批。计划有变时，可在批准前取消申请。",
                            "Next: wait for the landlord’s review. If your plans change, you can cancel before approval.",
                          )}
                        </p>
                        <button
                          className="btn btn-secondary"
                          disabled={!!busy}
                          onClick={() => void decide(application.id, "cancel")}
                        >
                          {busy === application.id
                            ? t("处理中…", "Processing…")
                            : t("取消申请", "Cancel application")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {(application.status === "REJECTED" ||
                  application.status === "CANCELLED") && (
                  <div className="application-next-step">
                    <p>
                      {t(
                        "此申请已结束，不会因此产生入住或费用。",
                        "This application is closed and does not create an occupancy or charge.",
                      )}
                    </p>
                    <Link
                      className="text-link"
                      href={landlord ? "/organizer/listings" : "/search"}
                    >
                      {landlord
                        ? t("查看房源", "View listings")
                        : t("寻找其他住处", "Explore other homes")}
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </RentalFrame>
  );
}
