"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export async function rentalRequest<T>(
  path: string,
  body?: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const r = await fetch(path, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "REQUEST_FAILED");
  return data;
}
export function useRemote<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const n = ++generation.current;
    setData(null);
    setLoading(true);
    setError("");
    try {
      const result = await rentalRequest<T>(path);
      if (n === generation.current) setData(result);
    } catch (e) {
      if (n === generation.current) {
        setData(null);
        setError(e instanceof Error ? e.message : "REQUEST_FAILED");
      }
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    const counter = generation;
    const timer = setTimeout(() => void reload(), 0);
    return () => {
      counter.current += 1;
      setData(null);
      clearTimeout(timer);
    };
  }, [reload]);
  return { data, error, loading, reload };
}
