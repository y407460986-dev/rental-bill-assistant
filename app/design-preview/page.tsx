import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DesignPreview from "@/components/DesignPreview";
export const metadata: Metadata = {
  title: "UI Design Preview | Rental Bill Assistant",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignPreview />;
}
