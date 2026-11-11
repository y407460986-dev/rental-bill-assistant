"use client";
import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "./ui/SiteShell";
import { useLanguage } from "./ui/useLanguage";
import Icon from "./ui/Icon";
import ChargeDetail from "./ui/ChargeDetail";
import ChargesList, { type ChargeSummary } from "./ui/ChargesList";
import LoginPanel from "./ui/LoginPanel";
import HomePage from "./HomePage";
import UploadForm from "./ui/UploadForm";
import BillReview, { type Bill } from "./ui/BillReview";
import { statusLabel } from "./ui/statusLabel";
import { useRouter } from "next/navigation";
import { uploadToSignedUrl } from "@/lib/storage/client";
import { must } from "@/lib/http";
import {
  checkoutAction,
  createCheckoutController,
  type CheckoutPhase,
  type CheckoutController,
} from "@/lib/paypal/checkout";
interface Charge {
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
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function call(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers:
            body instanceof FormData
              ? undefined
              : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new RequestError(data.error || "Request failed", response.status);
  return data;
}
export default function Workspace({
  mode,
  id,
}: {
  mode: "home" | "login" | "upload" | "bill" | "charges" | "charge";
  id?: string;
}) {
  const router = useRouter();
  const { en, t } = useLanguage();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(mode !== "home" && mode !== "login");
  const actionRunning = useRef(false);
  const pageGeneration = useRef(0);
  const loginForm = useRef<HTMLFormElement>(null);
  const checkout = useRef<CheckoutController<Charge> | null>(null);
  const [paymentPhase, setPaymentPhase] = useState<CheckoutPhase>("idle");
  const [paypalReturn, setPaypalReturn] = useState<
    "cancelled" | "returned" | null
  >(null);
  const [uploadedBillId, setUploadedBillId] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [duplicateUpload, setDuplicateUpload] = useState(false);
  const [billReadAt, setBillReadAt] = useState(0);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null),
    [properties, setProperties] = useState<{ id: string; title: string }[]>([]);
  const [bill, setBill] = useState<Bill | null>(null),
    [charges, setCharges] = useState<ChargeSummary[]>([]),
    [charge, setCharge] = useState<Charge | null>(null),
    [payment, setPayment] = useState("");
  function clearPrivateData() {
    setUser(null);
    setProperties([]);
    setBill(null);
    setCharges([]);
    setCharge(null);
    setPayment("");
    checkout.current = null;
    setPaymentPhase("idle");
  }
  function beginNavigation(href: string) {
    if (window.location.pathname === href) return;
    // Link navigation can wait for a route response before effect cleanup.
    // Stop old continuations as soon as the user chooses another page.
    pageGeneration.current += 1;
    actionRunning.current = true;
    setBusy(true);
    setError("");
  }
  async function load(generation: number, completeApproved = true) {
    if (generation !== pageGeneration.current) return;
    if (mode === "home" || mode === "login") return;
    clearPrivateData();
    setLoading(true);
    try {
      const who = await call("/api/auth/me");
      if (generation !== pageGeneration.current) return;
      if (mode === "upload") {
        const items = await call("/api/organizer/properties");
        if (generation !== pageGeneration.current) return;
        setProperties(items);
      }
      if (mode === "bill" && id) await refreshBill(id, generation);
      if (mode === "charges") {
        const items = await call("/api/tenant/charges");
        if (generation !== pageGeneration.current) return;
        setCharges(items);
      }
      if (mode === "charge") {
        const current = await call("/api/tenant/charges/" + id);
        if (generation !== pageGeneration.current) return;
        const controller = createCheckoutController<Charge>(current, {
          getCharge: () => call("/api/tenant/charges/" + id),
          getPayment: () => call("/api/tenant/charges/" + id + "/payment"),
          createPayment: () =>
            call("/api/tenant/charges/" + id + "/payment", {}),
          capturePayment: () =>
            call("/api/tenant/charges/" + id + "/capture", {}),
          redirect: (url) => window.location.assign(url),
          onChange: (snapshot) => {
            setCharge(snapshot.charge);
            setPayment(snapshot.status);
            setPaymentPhase(snapshot.phase);
          },
        });
        checkout.current = controller;
        setCharge(current);
        setUser(who);
        setPayment(controller.getSnapshot().status);
        try {
          if (!current.paid)
            await controller.read(
              { isCurrent: () => generation === pageGeneration.current },
              completeApproved,
            );
        } catch (e) {
          if (generation !== pageGeneration.current) return;
          if (e instanceof RequestError && [401, 403, 404].includes(e.status))
            throw e;
          setError(
            e instanceof Error ? e.message : "PAYMENT_STATUS_UNAVAILABLE",
          );
        }
      }
      if (generation === pageGeneration.current) setUser(who);
    } catch (e) {
      if (generation === pageGeneration.current) clearPrivateData();
      throw e;
    } finally {
      if (generation === pageGeneration.current) setLoading(false);
    }
  }
  useLayoutEffect(() => {
    const generation = ++pageGeneration.current;
    const form = loginForm.current;
    actionRunning.current = false;
    const task = window.setTimeout(() => {
      setHydrated(true);
      setBusy(false);
      setError("");
      const params = new URLSearchParams(window.location.search);
      setPaypalReturn(
        params.get("cancelled") === "1"
          ? "cancelled"
          : params.has("token") || params.has("PayerID")
            ? "returned"
            : null,
      );
      load(generation).catch((e) => {
        if (generation === pageGeneration.current) setError(e.message);
      });
    }, 0);
    return () => {
      // Activity may preserve this page. Hide private state before it reappears,
      // and prevent already-issued requests from changing the next page.
      pageGeneration.current += 1;
      window.clearTimeout(task);
      clearPrivateData();
      form?.reset();
      setHydrated(false);
      setLoading(mode !== "home" && mode !== "login");
      setUploadedBillId(null);
      setDuplicateUpload(false);
    };
  }, [mode, id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function refreshBill(billId: string, generation: number) {
    if (generation !== pageGeneration.current) return;
    try {
      const current: Bill = await call("/api/organizer/bills/" + billId);
      if (generation === pageGeneration.current) {
        setBill(current);
        setBillReadAt(Date.now());
      }
      return current;
    } catch (e) {
      // Do not offer actions against a snapshot whose latest state is unknown.
      if (generation === pageGeneration.current) clearPrivateData();
      throw e;
    }
  }
  async function processAndReload(billId: string, generation: number) {
    if (generation !== pageGeneration.current) return;
    let processingError = "";
    try {
      await call("/api/organizer/bills/" + billId + "/process", {});
    } catch (e) {
      processingError = e instanceof Error ? e.message : "Request failed";
    }
    if (generation !== pageGeneration.current) return;
    try {
      await refreshBill(billId, generation);
    } catch (e) {
      const refreshError = e instanceof Error ? e.message : "Request failed";
      throw new Error(
        [processingError, "BILL_REFRESH_FAILED: " + refreshError]
          .filter(Boolean)
          .join("; "),
      );
    }
    if (processingError) throw new Error(processingError);
  }
  async function run(action: (generation: number) => Promise<void>) {
    if (!hydrated || actionRunning.current) return;
    const generation = ++pageGeneration.current;
    actionRunning.current = true;
    setBusy(true);
    setError("");
    try {
      await action(generation);
    } catch (e) {
      if (generation === pageGeneration.current) {
        if (
          e instanceof RequestError &&
          (e.status === 401 ||
            e.status === 403 ||
            (mode === "charge" && e.status === 404))
        )
          clearPrivateData();
        setError(e instanceof Error ? e.message : "Request failed");
      }
    } finally {
      if (generation === pageGeneration.current) {
        actionRunning.current = false;
        setBusy(false);
        setLoading(false);
      }
    }
  }
  async function mutateAndReload(
    path: string,
    body: unknown,
    generation: number,
  ) {
    let mutationError: unknown;
    try {
      await call(path, body);
    } catch (e) {
      mutationError = e;
    }
    if (generation !== pageGeneration.current) return;
    try {
      await load(generation);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed";
      throw new Error(
        [
          mutationError instanceof Error ? mutationError.message : "",
          "STATE_REFRESH_FAILED: " + message,
        ]
          .filter(Boolean)
          .join("; "),
      );
    }
    if (mutationError) throw mutationError;
  }
  async function queryPayment(generation: number) {
    if (generation !== pageGeneration.current) return;
    if (!checkout.current) {
      await load(generation, false);
      return;
    }
    // Recovery starts with a read only. Approval can then offer explicit completion.
    await checkout.current.read({
      isCurrent: () => generation === pageGeneration.current,
    });
  }
  async function actOnPayment(generation: number) {
    if (generation !== pageGeneration.current) return;
    await checkout.current?.act({
      isCurrent: () => generation === pageGeneration.current,
    });
  }
  async function logout() {
    if (actionRunning.current) return;
    await run(async (generation) => {
      clearPrivateData();
      setUploadedBillId(null);
      setDuplicateUpload(false);
      await call("/api/auth/logout", {});
      if (generation !== pageGeneration.current) return;
      // Authentication changes must discard Next's preserved client pages.
      window.location.replace("/login");
    });
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!hydrated) return;
    event.currentTarget.reset();
    await run(async (generation) => {
      const result = await call("/api/auth/login", {
        email: form.get("email"),
        password: form.get("password"),
      });
      if (generation !== pageGeneration.current) return;
      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext =
        next && /^[/]properties[/][a-zA-Z0-9-]+$/.test(next) ? next : null;
      window.location.replace(
        safeNext ??
          (result.role === "LANDLORD"
            ? "/organizer/listings"
            : "/rental/applications"),
      );
    });
  }
  async function signup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!hydrated) return;
    await run(async (generation) => {
      const result = await call("/api/auth/signup", {
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
      });
      if (generation !== pageGeneration.current) return;
      window.location.replace(
        result.role === "LANDLORD"
          ? "/organizer/listings"
          : "/rental/applications",
      );
    });
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const propertyId = String(form.get("propertyId") || "");
    await run(async (generation) => {
      setUploadedBillId(null);
      setDuplicateUpload(false);
      setBill(null);
      must(file instanceof File && file.size > 0, "INVALID_FILE");
      const contentType = (file as File).type;
      // Step 1: ask the server for a signed Storage upload target.
      const init = await call("/api/organizer/bills/upload-init", {
        propertyId,
        contentType,
      });
      if (generation !== pageGeneration.current) return;
      // Step 2: upload the file bytes directly to Supabase Storage. This
      // bypasses the Vercel function body-size limit entirely.
      await uploadToSignedUrl(
        init.path,
        init.token,
        init.bucket,
        file as File,
        contentType,
      );
      if (generation !== pageGeneration.current) return;
      // Step 3: tell the server the upload finished so it can validate the
      // bytes and create the Bill record.
      const result = await call("/api/organizer/bills/upload-finalize", {
        path: init.path,
        propertyId,
      });
      if (generation !== pageGeneration.current) return;
      setUploadedBillId(result.billId);
      setDuplicateUpload(result.duplicate);
      const current = await refreshBill(result.billId, generation);
      if (generation !== pageGeneration.current || !current) return;
      // Upload is the user intent; mounting or refreshing a page must never
      // start model calls. A duplicate may already be reviewed or published.
      if (
        current.processing?.status === "QUEUED" &&
        !current.versions.some((version) => version.status === "PUBLISHED")
      ) {
        await processAndReload(result.billId, generation);
      }
      if (generation === pageGeneration.current && !result.duplicate) {
        router.push("/organizer/bills/" + result.billId);
      }
    });
  }
  const v = bill?.versions[0];
  const published = bill?.versions.some(
    (version) => version.status === "PUBLISHED",
  );
  const processing = bill?.processing?.status === "PROCESSING";
  const leaseActive =
    processing &&
    (!bill.processing?.leaseUntil ||
      new Date(bill.processing.leaseUntil).getTime() >= billReadAt);
  const canProcess =
    bill && !published && bill.processing?.status !== "READY" && !leaseActive;
  const paymentAction = charge ? checkoutAction(charge, payment) : null;
  function paymentNotice() {
    if (!charge || charge.paid || payment === "COMPLETED") return "";
    if (paymentPhase === "completing")
      return t(
        "PayPal 已授权，正在完成付款。请稍候。",
        "PayPal authorized this payment. Completing it now; please wait.",
      );
    if (paymentPhase === "checking")
      return t("正在查询付款状态…", "Checking payment status…");
    if (payment === "UNKNOWN")
      return t(
        "付款结果尚未确认。请先查询状态，不要重新发起付款。",
        "The payment result is not yet confirmed. Check its status before starting another payment.",
      );
    if (payment === "APPROVED")
      return t(
        "PayPal 已授权，但付款尚未完成。你可以继续完成这笔付款。",
        "PayPal authorized this payment, but it is not paid yet. Complete the same payment below.",
      );
    if (paymentAction === "query")
      return t(
        "这笔付款尚未完成，请查询状态。如问题持续，请联系房东。",
        "This payment is not complete. Check its status, or contact your landlord if the issue continues.",
      );
    if (paypalReturn === "cancelled")
      return t(
        "已取消本次 PayPal 跳转，付款尚未完成。可继续原来的付款。",
        "You cancelled this PayPal checkout. Payment is not complete; you can continue the same payment.",
      );
    if (paypalReturn === "returned")
      return t(
        "已从 PayPal 返回，尚未确认付款完成。可继续原来的付款。",
        "You are back from PayPal; payment is not yet confirmed. You can continue the same payment.",
      );
    if (paymentAction === "continue")
      return t(
        "付款尚未完成，可返回 PayPal 继续原付款。",
        "Payment is not complete. Return to PayPal to continue the same payment.",
      );
    return "";
  }
  const paymentMessage = paymentNotice();
  if (mode === "home") return <HomePage />;
  return (
    <>
      <SiteHeader
        active={
          mode === "charge" ? "charges" : mode === "bill" ? "upload" : mode
        }
        user={user}
        busy={busy}
        onLogout={logout}
        onNavigate={beginNavigation}
      />
      <main id="content" className="workspace container">
        {mode !== "login" && (
          <div className="workspace-toolbar">
            <div>
              <Icon name="home" size={15} />
              <span>{t("个人空间", "Your workspace")}</span>
              <span>/</span>
              <span>
                {mode === "upload" || mode === "bill"
                  ? t("房东账单管理", "Landlord billing")
                  : t("我的账单", "My bills")}
              </span>
            </div>
          </div>
        )}
        {error && (
          <aside role="alert">
            <strong>
              {t("暂时没能完成操作", "We couldn't complete that action")}
            </strong>
            <p>
              {error.includes("401") ||
              error.includes("UNAUTHORIZED") ||
              error.includes("AUTH")
                ? t("请登录后继续。", "Please sign in to continue.")
                : error.includes("403") || error.includes("FORBIDDEN")
                  ? t(
                      "当前账号没有权限查看此内容。",
                      "This account does not have access to this content.",
                    )
                  : t(
                      "请检查信息后重试。已保存的记录不会因这次失败而删除。",
                      "Review the information and try again. Saved records remain available.",
                    )}
            </p>
            <details>
              <summary>{t("查看错误详情", "Error details")}</summary>
              {error}
            </details>
            <Link href="/login" onNavigate={() => beginNavigation("/login")}>
              {t("前往登录", "Sign in")}
            </Link>
            {mode !== "login" && (mode !== "charge" || !paymentAction) && (
              <button
                disabled={busy || (mode === "charge" && loading)}
                onClick={() => run(mode === "charge" ? queryPayment : load)}
              >
                {mode === "charge"
                  ? t("查询付款状态", "Check payment status")
                  : t("重新读取状态", "Reload current state")}
              </button>
            )}
          </aside>
        )}
        {(busy || loading) && (
          <p role="status">
            {uploadedBillId
              ? t(
                  "凭证已保存，正在读取或处理账单，请勿重复上传…",
                  "Evidence saved. Reading or processing the bill; do not upload again…",
                )
              : t("正在处理，请稍候…", "Processing, please wait…")}
          </p>
        )}
        {mode === "login" && (
          <LoginPanel en={en}>
            <form
              ref={loginForm}
              method="post"
              action="/api/auth/login"
              onSubmit={login}
            >
              <label>
                {t("邮箱", "Email")}
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  disabled={!hydrated || busy}
                />
              </label>
              <label>
                {t("密码", "Password")}
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  disabled={!hydrated || busy}
                />
              </label>
              <button disabled={!hydrated || busy}>
                {t("登录", "Sign in")}
              </button>
            </form>
            {signupOpen ? (
              <form method="post" action="/api/auth/signup" onSubmit={signup}>
                <label>
                  {t("称呼", "Name")}
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    disabled={!hydrated || busy}
                  />
                </label>
                <label>
                  {t("邮箱", "Email")}
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    disabled={!hydrated || busy}
                  />
                </label>
                <label>
                  {t("密码（至少 8 位）", "Password (8+ characters)")}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    disabled={!hydrated || busy}
                  />
                </label>
                <label>
                  {t("账号类型", "Account type")}
                  <select
                    name="role"
                    defaultValue="TENANT"
                    disabled={!hydrated || busy}
                  >
                    <option value="TENANT">
                      {t(
                        "租客 · 找房、申请、看账单",
                        "Tenant · find a home and see bills",
                      )}
                    </option>
                    <option value="LANDLORD">
                      {t(
                        "房东 · 发布房源与账单",
                        "Landlord · list homes and bills",
                      )}
                    </option>
                  </select>
                </label>
                <button disabled={!hydrated || busy}>
                  {t("创建账号", "Create account")}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setSignupOpen(false)}
                >
                  {t("返回登录", "Back to sign in")}
                </button>
              </form>
            ) : (
              <p className="muted">
                {t("还没有账号？", "New here? ")}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setSignupOpen(true)}
                >
                  {t("注册账号", "Create an account")}
                </button>
              </p>
            )}
            <noscript>
              {t("请启用 JavaScript 后登录。", "Enable JavaScript to sign in.")}
            </noscript>
          </LoginPanel>
        )}
        {mode === "upload" && (
          <section>
            <p className="eyebrow">LANDLORD WORKSPACE</p>
            <h1>
              {t("账单交给 AI，时间留给生活。", "Less paperwork. More living.")}
            </h1>
            <p className="muted">
              {t(
                "上传电费凭证，核对识别结果和分摊明细，再发布给租客。",
                "Upload an electricity statement, review the extracted details and allocation, then publish to tenants.",
              )}
            </p>
            <div className="workflow-steps">
              <span className="is-current">
                <b>01</b>
                {t("上传凭证", "Upload evidence")}
              </span>
              <span>
                <b>02</b>
                {t("核对与分摊", "Review & allocate")}
              </span>
              <span>
                <b>03</b>
                {t("确认并发布", "Confirm & publish")}
              </span>
            </div>
            {!uploadedBillId && (
              <UploadForm
                en={en}
                busy={busy || loading || !hydrated}
                properties={properties}
                onSubmit={upload}
              />
            )}
            {uploadedBillId && (
              <aside>
                <p role="status">
                  {duplicateUpload
                    ? t(
                        "检测到重复凭证，已保留原账单。",
                        "Duplicate evidence; the existing bill is retained.",
                      )
                    : t(
                        "凭证已保存，无需重新上传。",
                        "Evidence saved; no need to upload again.",
                      )}
                  {bill && (
                    <>
                      {" "}
                      · {statusLabel(bill.processing?.status, en)} ·{" "}
                      {statusLabel(bill.versions[0]?.status, en)}
                    </>
                  )}
                </p>
                <Link
                  href={"/organizer/bills/" + uploadedBillId}
                  onNavigate={() =>
                    beginNavigation("/organizer/bills/" + uploadedBillId)
                  }
                >
                  {t(
                    "打开账单，查看结果或重试",
                    "Open bill to view results or retry",
                  )}
                </Link>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async (generation) => {
                      await refreshBill(uploadedBillId, generation);
                    })
                  }
                >
                  {t("刷新状态", "Refresh status")}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setUploadedBillId(null);
                    setDuplicateUpload(false);
                    setBill(null);
                    setError("");
                  }}
                >
                  {t("上传另一张凭证", "Upload another statement")}
                </button>
              </aside>
            )}
          </section>
        )}
        {mode === "bill" && id && (
          <button disabled={busy} onClick={() => run(load)}>
            {t("刷新账单状态", "Refresh bill status")}
          </button>
        )}
        {mode === "bill" && bill && (
          <BillReview
            bill={bill}
            id={id}
            en={en}
            v={v}
            busy={busy}
            processing={!!processing}
            leaseActive={!!leaseActive}
            canProcess={!!canProcess}
            run={run}
            processAndReload={processAndReload}
            mutateAndReload={mutateAndReload}
          />
        )}
        {mode === "charges" && (
          <ChargesList
            charges={charges}
            en={en}
            loading={loading}
            ready={!error && !!user}
            onNavigate={beginNavigation}
          />
        )}
        {mode === "charge" && charge && (
          <ChargeDetail charge={charge} en={en} payment={payment}>
            {paymentMessage && (
              <p role="status" className="muted">
                {paymentMessage}
              </p>
            )}
            {paymentAction && (
              <div className="actions">
                <button
                  disabled={
                    busy || loading || !hydrated || paymentPhase !== "idle"
                  }
                  onClick={() =>
                    run(
                      paymentAction === "confirm"
                        ? (generation) =>
                            mutateAndReload(
                              "/api/tenant/charges/" + id + "/confirm",
                              {},
                              generation,
                            )
                        : actOnPayment,
                    )
                  }
                >
                  {paymentAction === "confirm"
                    ? t("确认费用", "Confirm charge")
                    : paymentAction === "pay"
                      ? t("使用 PayPal 付款", "Pay with PayPal")
                      : paymentAction === "continue"
                        ? t("继续付款", "Continue payment")
                        : paymentAction === "complete"
                          ? t("完成付款", "Complete payment")
                          : t("查询付款状态", "Check payment status")}
                </button>
              </div>
            )}
          </ChargeDetail>
        )}
      </main>
      <SiteFooter onNavigate={beginNavigation} />
    </>
  );
}
