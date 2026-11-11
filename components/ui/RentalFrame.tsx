"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SiteHeader, SiteFooter } from "./SiteShell";
import { useLanguage } from "./useLanguage";
import { useRemote, rentalRequest } from "./useRemote";
const messages: Record<string, [string, string]> = {
  LOGIN_REQUIRED: [
    "请登录租客或房东账号后继续。",
    "Sign in with a tenant or landlord account to continue.",
  ],
  FORBIDDEN: [
    "当前账号没有权限执行此操作。",
    "This account cannot perform that action.",
  ],
  NO_CAPACITY: [
    "所选日期已无空位，请更换房间或日期。",
    "No capacity for those dates. Choose another room or date.",
  ],
  DUPLICATE_APPLICATION: [
    "已有日期重叠的申请，请先查看我的申请。",
    "An overlapping application already exists. Check your applications.",
  ],
  DUPLICATE_TENANCY: [
    "已有日期重叠的入住记录。",
    "An overlapping tenancy already exists.",
  ],
  POLICY_CHANGED: [
    "费用约定已变化，请刷新房源后重新确认。",
    "The terms changed. Reload the listing and confirm again.",
  ],
  LISTING_UNAVAILABLE: [
    "该房源已下架或暂不可申请。",
    "This listing is unavailable.",
  ],
  LISTING_PUBLISHED: [
    "房源已发布，请先下架后再修改草稿。",
    "This listing is published. Unpublish it before editing the draft.",
  ],
  LISTING_IN_USE: [
    "此房源已有关联申请、入住或账单，不能修改草稿资料。",
    "This listing has applications, stays or billing records and cannot be edited as a draft.",
  ],
  LEGACY_LISTING_READ_ONLY: [
    "此房源保留历史资料或规则，不支持草稿编辑。请新建房源。",
    "This property retains historical records or policies. Create a new listing instead of editing it as a draft.",
  ],
  START_IN_PAST: [
    "开始日期不能早于今天。",
    "The start date cannot be in the past.",
  ],
  BEFORE_AVAILABLE_DATE: [
    "开始日期早于房源可入住日期。",
    "Choose a date on or after availability.",
  ],
  APPLICATION_FINAL: [
    "申请已处理，刷新后查看最新状态。",
    "The application was already decided. Reload its status.",
  ],
  CONSENT_REQUIRED: [
    "申请缺少双方费用约定，请重新提交申请。",
    "The application needs confirmed terms. Submit a new application.",
  ],
  INVALID_INPUT: [
    "请检查必填项、日期、金额与房间设置。",
    "Check required fields, dates, price and room settings.",
  ],
  NOT_FOUND: ["未找到房源或申请。", "Listing or application not found."],
};
export function RentalError({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  const { en, t } = useLanguage();
  return error ? (
    <div role="alert" className="notice notice-warning">
      <p>
        {messages[error]?.[en ? 1 : 0] ??
          t(
            "暂时无法完成操作，请稍后重试。",
            "We couldn't complete that action. Try again shortly.",
          )}
      </p>
      {error === "LOGIN_REQUIRED" && (
        <Link href="/login">{t("去登录", "Sign in")}</Link>
      )}
      {retry && (
        <button className="btn btn-secondary" onClick={retry}>
          {t("重新读取", "Reload")}
        </button>
      )}
      <details>
        <summary>{t("详情", "Details")}</summary>
        {error}
      </details>
    </div>
  ) : null;
}
export function SessionHeader({ active }: { active?: string }) {
  const [logoutError, setLogoutError] = useState("");
  const [busy, setBusy] = useState(false);
  const who = useRemote<{ name: string; role: string }>("/api/auth/me");
  const logout = async () => {
    setBusy(true);
    setLogoutError("");
    try {
      await rentalRequest("/api/auth/logout", {});
      window.location.replace("/login");
    } catch {
      setLogoutError("LOGOUT_FAILED");
      setBusy(false);
    }
  };
  return (
    <>
      <SiteHeader
        active={active}
        user={who.data}
        busy={busy || who.loading}
        onLogout={logout}
      />
      <RentalError error={logoutError} />
    </>
  );
}
export function RentalFrame({
  children,
  active,
}: {
  children: ReactNode;
  active?: string;
}) {
  return (
    <>
      <SessionHeader active={active} />
      <main id="content" className="workspace container rental-workspace">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
