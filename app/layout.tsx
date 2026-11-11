import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title:
    "Rental Bill Assistant — AI reads the bill, code does the money · 合租明白账",
  description:
    "Upload a utility statement: the AI only reads it, deterministic code does the money. Conflicts stay visible, the verified balance splits across tenants by person-days, and tenants pay through PayPal Sandbox.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
