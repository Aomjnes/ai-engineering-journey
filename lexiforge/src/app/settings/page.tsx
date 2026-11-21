"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { timeAgo } from "@/lib/client/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/lf/states";
import { usePrefs } from "@/components/lf/prefs";
import { Segmented } from "@/components/ui/segmented";

interface SettingsData {
  llm: { provider: string; model: string } | null;
  keys: { anthropic: boolean; openai: boolean; gemini: boolean };
  cron: { secretConfigured: boolean; internalScheduler: boolean };
  feeds: Array<{ name: string; url: string; status: string; lastFetchedAt: string | null; lastError: string | null; consecutiveFailures: number }>;
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between py-2 text-[13.5px]">
      <span className="font-mono text-[12.5px] text-ink-2">{label}</span>
      {on ? <span className="flex items-center gap-1 text-mastered-ink"><Check className="size-3.5" aria-hidden />set</span> : <span className="flex items-center gap-1 text-ink-3"><X className="size-3.5" aria-hidden />not set</span>}
    </li>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { lang, setLang, theme, setTheme } = usePrefs();
  useEffect(() => {
    api<SettingsData>("/api/settings").then(setData).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <EmptyState title="Settings could not load" body={error} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="eyebrow">Configuration</p>
        <h1 className="mt-1 font-serif text-[30px] font-medium tracking-[-0.015em]">Settings</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Stored in this browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 text-[13.5px]">
            <span>Explanation language</span>
            <Segmented label="Explanation language" value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }]} />
          </div>
          <div className="flex items-center justify-between gap-4 text-[13.5px]">
            <span>Theme</span>
            <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </div>
        </CardContent>
      </Card>
      {!data ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Language model {data.llm ? <Badge variant="mastered">{data.llm.provider} · {data.llm.model}</Badge> : <Badge variant="critical">not configured</Badge>}</CardTitle>
              <CardDescription>Keys live in <code className="font-mono">lexiforge/.env</code> and are never sent to the browser. Auto-detected in this order; restart the server after editing.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-line">
                <Flag on={data.keys.anthropic} label="ANTHROPIC_API_KEY" />
                <Flag on={data.keys.openai} label="OPENAI_API_KEY" />
                <Flag on={data.keys.gemini} label="GEMINI_API_KEY" />
              </ul>
              {!data.llm && (
                <pre className="mt-3 overflow-x-auto rounded-md bg-surface p-3 font-mono text-[12px] text-ink-2">{`# lexiforge/.env\nANTHROPIC_API_KEY="..."   # or OPENAI_API_KEY / GEMINI_API_KEY`}</pre>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Daily ingestion</CardTitle>
              <CardDescription>The cron endpoint needs CRON_SECRET; the in-process scheduler runs daily at 05:30 when enabled.</CardDescription>
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
              <CardTitle>Live sources</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-line">
                {data.feeds.map((f) => (
                  <li key={f.url} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                    <span className={f.status === "ACTIVE" ? "size-2 rounded-full bg-mastered" : f.status === "FAILING" ? "size-2 rounded-full bg-critical" : "size-2 rounded-full bg-ink-3"} aria-hidden />
                    <span className="flex-1">{f.name}</span>
                    <span className="num text-[12px] text-ink-3" title={f.lastError ?? undefined}>{f.lastFetchedAt ? `fetched ${timeAgo(f.lastFetchedAt)}` : "never fetched"}{f.consecutiveFailures ? ` · ${f.consecutiveFailures} failures` : ""}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
