"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { RATE_LIMIT_EVENT } from "@/lib/client/api";
import { usePrefs } from "./prefs";

/** Live countdown shown when every AI provider is cooling down (driven by the server's retryAfterSeconds). */
export function RateLimitBanner() {
  const { t, fmt } = usePrefs();
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const on = (e: Event) => setUntil((e as CustomEvent<{ until: number }>).detail.until);
    window.addEventListener(RATE_LIMIT_EVENT, on);
    return () => window.removeEventListener(RATE_LIMIT_EVENT, on);
  }, []);
  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  useEffect(() => {
    if (until !== null && now > until + 4000) setUntil(null);
  }, [now, until]);
  if (until === null) return null;
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <div role="status" aria-live="polite" className="animate-in fixed inset-x-0 top-16 z-40 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-full border border-moderate/40 bg-card px-4 py-2 text-[13px] text-ink shadow-lift">
      <Timer className="size-4 text-moderate-ink" aria-hidden />
      {left > 0 ? fmt(t.quota.banner, { n: left }) : t.quota.bannerReady}
    </div>
  );
}
