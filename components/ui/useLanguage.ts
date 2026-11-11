"use client";
import { useEffect, useSyncExternalStore } from "react";
function subscribe(changed: () => void) {
  window.addEventListener("rental-language", changed);
  window.addEventListener("storage", changed);
  return () => {
    window.removeEventListener("rental-language", changed);
    window.removeEventListener("storage", changed);
  };
}
export function useLanguage() {
  const en = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem("rental-lang") === "en",
    () => false,
  );
  useEffect(() => {
    document.documentElement.lang = en ? "en" : "zh-CN";
  }, [en]);
  // First visit follows the browser language; an explicit choice always wins.
  useEffect(() => {
    if (localStorage.getItem("rental-lang") !== null) return;
    const locale = (navigator.language || "").toLowerCase();
    localStorage.setItem("rental-lang", locale.startsWith("zh") ? "zh" : "en");
    window.dispatchEvent(new Event("rental-language"));
  }, []);
  const setEn = (value: boolean) => {
    localStorage.setItem("rental-lang", value ? "en" : "zh");
    window.dispatchEvent(new Event("rental-language"));
  };
  return { en, setEn, t: (zh: string, english: string) => (en ? english : zh) };
}
