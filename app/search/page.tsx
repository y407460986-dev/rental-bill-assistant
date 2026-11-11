import { Suspense } from "react";
import PropertySearch from "@/components/PropertySearch";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="container browse-page" aria-busy="true">
          <p role="status">正在加载房源 / Loading homes…</p>
        </main>
      }
    >
      <PropertySearch />
    </Suspense>
  );
}
