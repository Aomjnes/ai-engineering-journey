"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/client/api";
import { clearStreamStorage } from "@/lib/client/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/textarea";
import { usePrefs } from "./prefs";
import { useShell } from "./shell-data";

/** Settings "Danger zone": erase this stream's learning data after typing the exact stream code. */
export function ResetStreamSection() {
  const { t, fmt, err } = usePrefs();
  const { status, refresh } = useShell();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [keepLang, setKeepLang] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (!status) return null;
  const streamCode = status.stream.code;
  const items = [t.reset.item1, t.reset.item2, t.reset.item3, t.reset.item4, t.reset.item5, t.reset.item6];

  async function confirm() {
    if (code.trim() !== streamCode || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/stream/reset", { confirmCode: code.trim(), preserveLanguage: keepLang });
      clearStreamStorage(status!.stream.id, keepLang ? ["theme"] : []);
      setToast(t.reset.done);
      setOpen(false);
      await refresh();
      router.refresh();
      setTimeout(() => router.replace("/onboarding"), 900);
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="reset" aria-labelledby="reset-title" className="rounded-lg border border-critical/40 bg-card p-5">
      <h2 id="reset-title" className="flex items-center gap-2 text-[15px] font-semibold text-critical-ink">
        <AlertTriangle className="size-4" aria-hidden /> {t.reset.title}
      </h2>
      <p className="mt-1.5 text-[13.5px] text-ink-2">{fmt(t.reset.desc, { code: streamCode })}</p>
      <p className="mt-3 text-[13px] font-medium text-ink">{t.reset.willErase}</p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
      <p className="mt-3 rounded-md bg-surface p-3 text-[12.5px] text-ink-2">{t.reset.safe}</p>
      <Button variant="danger" className="mt-4" onClick={() => { setCode(""); setError(null); setOpen(true); }}>{t.reset.button}</Button>
      {toast && <p role="status" className="animate-in fixed inset-x-0 top-16 z-50 mx-auto w-fit rounded-full border border-mastered/40 bg-card px-4 py-2 text-[13px] text-mastered-ink shadow-lift">{toast}</p>}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 p-4" role="presentation" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="reset-modal-title" className="animate-in w-full max-w-md rounded-lg border border-line bg-card p-5 shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 id="reset-modal-title" className="text-[16px] font-semibold text-critical-ink">{fmt(t.reset.modalTitle, { code: streamCode })}</h3>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label={t.common.close} className="rounded p-1 text-ink-3 hover:bg-surface hover:text-ink"><X className="size-4" /></button>
            </div>
            <p className="mt-2 text-[13.5px] text-ink-2">{fmt(t.reset.modalBody, { code: streamCode })}</p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              <label htmlFor="reset-code" className="eyebrow block">{t.reset.codeLabel}</label>
              <Input ref={input} id="reset-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} className="num tracking-[0.3em]" placeholder={streamCode} />
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={keepLang} onChange={(e) => setKeepLang(e.target.checked)} className="accent-[rgb(var(--accent))]" />
                {t.reset.keepLanguage}
              </label>
              {error && <p role="alert" className="text-[13px] text-critical-ink">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>{t.common.cancel}</Button>
                <Button type="submit" variant="danger" disabled={busy || code.trim() !== streamCode}>{busy ? t.reset.erasing : t.reset.confirm}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
