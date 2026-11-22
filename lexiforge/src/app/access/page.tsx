"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/components/lf/prefs";
import { LangSwitch } from "@/components/lf/lang-switch";
import { errorText } from "@/lib/i18n";

function AccessForm() {
  const params = useSearchParams();
  const { t } = usePrefs();
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; locked: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stream/enter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim() }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        setError({ message: errorText(t, body?.error?.code, body?.error?.message ?? t.access.failed), locked: res.status === 429 });
        setCode("");
        input.current?.focus();
        return;
      }
      const next = params.get("next");
      window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError({ message: t.access.network, locked: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="animate-in w-full max-w-sm rounded-lg border border-line bg-card p-7 shadow-lift" noValidate>
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-ink font-serif text-[17px] font-semibold text-canvas" aria-hidden>L</span>
        <span className="text-[15px] font-semibold tracking-[-0.01em]">LexiForge</span>
        <LangSwitch className="ml-auto" />
      </div>
      <h1 className="mt-6 font-serif text-[28px] font-medium leading-tight tracking-[-0.015em]">{t.access.title}</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">{t.access.body}</p>
      <label htmlFor="code" className="eyebrow mt-6 block">{t.access.label}</label>
      <div className={cn("mt-2 flex items-center rounded-md border bg-card transition-[border-color,box-shadow] duration-200 ease-lf focus-within:ring-4", error ? "border-critical/60 focus-within:ring-critical/10" : "border-line focus-within:border-accent/60 focus-within:ring-accent/10")}>
        <input
          ref={input}
          id="code"
          name="code"
          type={show ? "text" : "password"}
          inputMode="numeric"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={32}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy || error?.locked}
          aria-invalid={!!error}
          aria-describedby={error ? "code-error" : undefined}
          className="num h-12 min-w-0 flex-1 bg-transparent px-3.5 text-[20px] tracking-[0.35em] text-ink outline-none placeholder:tracking-normal placeholder:text-ink-3"
          placeholder="•••"
        />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t.access.hideCode : t.access.showCode} className="mr-1.5 rounded p-2 text-ink-3 hover:bg-surface hover:text-ink">
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      <p id="code-error" role="alert" className={cn("mt-2 min-h-5 text-[12.5px]", error?.locked ? "text-moderate-ink" : "text-critical-ink")}>{error?.message ?? ""}</p>
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={busy || !code.trim() || error?.locked}>
        {busy ? t.access.verifying : t.access.enter} {!busy && <ArrowRight aria-hidden />}
      </Button>
      <p className="mt-5 text-center text-[12px] text-ink-3">{t.access.footer}</p>
    </form>
  );
}

export default function AccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <Suspense fallback={null}>
        <AccessForm />
      </Suspense>
    </main>
  );
}
