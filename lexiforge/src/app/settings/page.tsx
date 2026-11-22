"use client";

import { useCallback, useEffect, useState } from "react";
import { useCrossDeviceSync, useShell } from "@/components/lf/shell-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/textarea";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { fmt, timeAgoIn } from "@/lib/i18n";
import { buttonVariants } from "@/components/ui/button";
import { LangSwitch } from "@/components/lf/lang-switch";
import { ResetStreamSection } from "@/components/lf/reset-stream";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/lf/states";
import { usePrefs } from "@/components/lf/prefs";
import { Segmented } from "@/components/ui/segmented";

interface SettingsData {
  llm: { provider: string; model: string } | null;
  keys: { anthropic: boolean; openai: boolean; gemini: boolean; groq: boolean };
  quota: {
    geminiKeyCount: number;
    geminiModels: string[];
    groqModel: string | null;
    maxConcurrency: number;
    inFlight: number;
    chain: Array<{ id: string; provider: string; model: string; keyLabel: string; order: number; cooldownSeconds: number; reason: string | null }>;
  };
  cron: { secretConfigured: boolean; internalScheduler: boolean };
  feeds: Array<{ name: string; url: string; status: string; lastFetchedAt: string | null; lastError: string | null; consecutiveFailures: number }>;
}

function Flag({ on, label }: { on: boolean; label: string }) {
  const { t } = usePrefs();
  return (
    <li className="flex items-center justify-between py-2 text-[13.5px]">
      <span className="font-mono text-[12.5px] text-ink-2">{label}</span>
      {on ? <span className="flex items-center gap-1 text-mastered-ink"><Check className="size-3.5" aria-hidden />{t.settings.set}</span> : <span className="flex items-center gap-1 text-ink-3"><X className="size-3.5" aria-hidden />{t.settings.notSet}</span>}
    </li>
  );
}

function StreamCard() {
  const { status, refresh, switchStream } = useShell();
  const { t, err } = usePrefs();
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (status) setLabel(status.stream.label);
  }, [status]);
  if (!status) return <Skeleton className="h-40" />;
  const save = async () => {
    setBusy(true);
    setSaved(null);
    try {
      await api("/api/stream/me", undefined, { method: "PATCH", body: { label } });
      await refresh();
      setSaved(t.common.saved);
    } catch (e) {
      setSaved(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.stream}</CardTitle>
        <CardDescription>{fmt(t.settings.streamDesc, { code: status.stream.code })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input aria-label={t.settings.streamLabel} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          <Button type="submit" disabled={busy || !label.trim() || label.trim() === status.stream.label}>{t.common.save}</Button>
        </form>
        {saved && <p className="text-[12.5px] text-ink-3">{saved}</p>}
        <Button variant="outline" onClick={() => void switchStream()}>{t.shell.switchStream}</Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme, setTheme, t, err } = usePrefs();
  const load = useCallback(() => {
    api<SettingsData>("/api/settings").then(setData).catch((e) => setError(err(e)));
  }, [err]);
  useEffect(() => load(), [load]);
  useCrossDeviceSync(load);

  if (error) return <EmptyState title={t.settings.loadFailed} body={error} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">{t.settings.eyebrow}</p>
        <h1 className="mt-1 font-serif text-[30px] font-medium tracking-[-0.015em]">{t.settings.title}</h1>
      </header>
      <StreamCard />
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.prefs}</CardTitle>
          <CardDescription>{t.settings.prefsDesc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 text-[13.5px]">
            <span>{t.settings.uiLanguage}</span>
            <LangSwitch size="md" />
          </div>
          <div className="flex items-center justify-between gap-4 text-[13.5px]">
            <span>{t.settings.theme}</span>
            <Segmented label={t.settings.theme} value={theme} onChange={setTheme} options={[{ value: "light", label: t.settings.light }, { value: "dark", label: t.settings.dark }]} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.goal}</CardTitle>
          <CardDescription>{t.settings.goalDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/roadmap" className={buttonVariants({ variant: "outline", size: "sm" })}>{t.settings.openRoadmap}</Link>
        </CardContent>
      </Card>
      {!data ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">{t.settings.llm} {data.llm ? <Badge variant="mastered">{data.llm.provider} · {data.llm.model}</Badge> : <Badge variant="critical">{t.settings.llmNone}</Badge>}</CardTitle>
              <CardDescription>{t.settings.llmDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-line">
                <Flag on={data.keys.anthropic} label="ANTHROPIC_API_KEY" />
                <Flag on={data.keys.openai} label="OPENAI_API_KEY" />
                <Flag on={data.keys.gemini} label={`GEMINI_API_KEY(S) · ${fmt(t.quota.keys, { n: data.quota.geminiKeyCount })}`} />
                <Flag on={data.keys.groq} label="GROQ_API_KEY" />
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t.quota.title}</CardTitle>
              <CardDescription>{t.quota.desc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.quota.chain.length === 0 ? (
                <p className="text-[13.5px] text-ink-3">{t.quota.none}</p>
              ) : (
                <ol className="divide-y divide-line" aria-label={t.quota.order}>
                  {data.quota.chain.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
                      <span className="num w-5 text-ink-3">{c.order}</span>
                      <span className={c.cooldownSeconds > 0 ? "size-2 rounded-full bg-moderate" : "size-2 rounded-full bg-mastered"} aria-hidden />
                      <span className="font-medium text-ink">{c.provider}</span>
                      <span className="font-mono text-[12px] text-ink-2">{c.model}</span>
                      <span className="text-[12px] text-ink-3">{c.keyLabel}</span>
                      <span className={c.cooldownSeconds > 0 ? "num ml-auto text-[12px] text-moderate-ink" : "num ml-auto text-[12px] text-mastered-ink"}>
                        {c.cooldownSeconds > 0 ? fmt(t.quota.cooling, { n: c.cooldownSeconds }) : t.quota.healthy}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="num text-[12px] text-ink-3">{fmt(t.quota.concurrency, { n: data.quota.maxConcurrency, m: data.quota.inFlight })} · {t.quota.instanceNote}</p>
              <p className="text-[12px] text-ink-3">{t.quota.hint}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.ingestion}</CardTitle>
              <CardDescription>{t.settings.ingestionDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-line">
                <Flag on={data.cron.secretConfigured} label="CRON_SECRET" />
                <Flag on={data.cron.internalScheduler} label="ENABLE_INTERNAL_CRON" />
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.sources}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-line">
                {data.feeds.map((f) => (
                  <li key={f.url} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                    <span className={f.status === "ACTIVE" ? "size-2 rounded-full bg-mastered" : f.status === "FAILING" ? "size-2 rounded-full bg-critical" : "size-2 rounded-full bg-ink-3"} aria-hidden />
                    <span className="flex-1">{f.name}</span>
                    <span className="num text-[12px] text-ink-3" title={f.lastError ?? undefined}>{f.lastFetchedAt ? fmt(t.settings.fetched, { ago: timeAgoIn(t, f.lastFetchedAt) }) : t.settings.neverFetched}{f.consecutiveFailures ? ` · ${fmt(t.settings.failures, { n: f.consecutiveFailures })}` : ""}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
      <ResetStreamSection />
    </div>
  );
}
