"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import Icon from "./Icon";
import { useLanguage } from "./useLanguage";
export function SiteHeader({
  active,
  user,
  busy,
  onLogout,
  onNavigate,
}: {
  active?: string;
  user?: { name: string; role: string } | null;
  busy?: boolean;
  onLogout?: () => void;
  onNavigate?: (href: string) => void;
}) {
  const { en, setEn, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const landlord = user?.role === "LANDLORD";
  const links = [
    { href: "/search", label: t("找房", "Find a home"), key: "search" },
    ...(user
      ? [
          ...(landlord
            ? [
                {
                  href: "/organizer/listings",
                  label: t("我的房源", "My listings"),
                  key: "listings",
                },
              ]
            : []),
          {
            href: "/rental/applications",
            label: landlord
              ? t("入住申请", "Applications")
              : t("我的申请与入住", "My stays"),
            key: "applications",
          },
          {
            href: landlord ? "/organizer/bills/new" : "/tenant/charges",
            label: t("水电账单", "Utility bills"),
            key: landlord ? "upload" : "charges",
          },
        ]
      : [
          {
            href: "/#rental-steps",
            label: t("租房流程", "How it works"),
            key: "how",
          },
          {
            href: "/organizer/listings",
            label: t("我是房东", "For landlords"),
            key: "listings",
          },
        ]),
  ];
  return (
    <header className="site-header">
      <a className="skip-link" href="#content">
        {t("跳至主要内容", "Skip to content")}
      </a>
      <div className="container site-header-inner">
        <Link
          href="/"
          className="site-brand"
          onNavigate={() => onNavigate?.("/")}
          aria-label={t("合租明白账首页", "Rental Bill Assistant home")}
        >
          <span className="brand-mark">
            <Icon name="home" size={23} />
          </span>
          <span>
            合租明白账
            <small>
              {t("找房 · 入住 · 费用", "HOMES · STAYS · SHARED BILLS")}
            </small>
          </span>
        </Link>
        <nav
          className="desktop-nav"
          aria-label={t("主导航", "Main navigation")}
        >
          {links.map((l) => (
            <Link
              href={l.href}
              key={l.key}
              aria-current={active === l.key ? "page" : undefined}
              onNavigate={() => onNavigate?.(l.href)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          {user && (
            <span className="header-identity">
              {landlord
                ? t("房东账号", "Landlord account")
                : user.role === "TENANT"
                  ? t("租客账号", "Tenant account")
                  : t("我的账号", "My account")}
            </span>
          )}
          <button
            className="language-switch"
            type="button"
            aria-label={en ? "切换为中文" : "Switch to English"}
            onClick={() => setEn(!en)}
          >
            <Icon name="globe" size={17} />
            {en ? "中文" : "EN"}
          </button>
          {user ? (
            <button className="account-link" disabled={busy} onClick={onLogout}>
              {t("退出", "Sign out")}
            </button>
          ) : busy ? (
            <span className="account-link" role="status">
              {t("正在连接…", "Connecting…")}
            </span>
          ) : (
            <Link
              className="account-link"
              href="/login"
              onNavigate={() => onNavigate?.("/login")}
            >
              {t("登录", "Sign in")}
              <Icon name="arrow" size={16} />
            </Link>
          )}
          <button
            className="mobile-menu-button"
            aria-label={t("导航菜单", "Navigation menu")}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label={t("手机导航", "Mobile navigation")}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        >
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              aria-current={active === l.key ? "page" : undefined}
              onClick={() => setOpen(false)}
              onNavigate={() => onNavigate?.(l.href)}
            >
              {l.label}
              <Icon name="arrow" size={16} />
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
export function SiteFooter({
  onNavigate,
}: { onNavigate?: (href: string) => void } = {}) {
  const { t } = useLanguage();
  return (
    <footer className="pagefoot">
      <div className="container footer-grid">
        <div>
          <Link
            className="footer-brand"
            href="/"
            onNavigate={() => onNavigate?.("/")}
          >
            合租明白账
          </Link>
          <p>
            {t(
              "住得合心，账算得明白。",
              "A place to belong. Bills that make sense.",
            )}
          </p>
        </div>
        <div className="footer-links">
          <Link href="/search" onNavigate={() => onNavigate?.("/search")}>
            {t("探索房源", "Explore homes")}
          </Link>
          <Link href="/#rental-steps" onNavigate={() => onNavigate?.("/")}>
            {t("租房流程", "How renting works")}
          </Link>
          <Link
            href="/organizer/listings"
            onNavigate={() => onNavigate?.("/organizer/listings")}
          >
            {t("发布与管理房源", "List your property")}
          </Link>
        </div>
        <p className="footer-note">
          {t(
            "找房、入住与共享费用管理",
            "Homes, stays and shared utility bills",
          )}
          <br />© 2026 Rental Bill Assistant
        </p>
      </div>
    </footer>
  );
}
export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="lead">{description}</p>}
      </div>
      {children}
    </div>
  );
}
