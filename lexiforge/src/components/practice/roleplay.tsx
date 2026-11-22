"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Mic, Volume2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/components/lf/prefs";
import { ErrorCards, type AnnotatedError } from "@/components/lf/error-annotator";
import { speakOnce, useSpeechToText } from "@/components/lesson/speech";
import { submitOnModEnter } from "@/components/lesson/common";
import { SessionDone, type RoleplaySession } from "./shared";

interface Coach {
  errors: AnnotatedError[];
  nativeVersion: string;
  coachEn: string;
  coachVi: string;
  gai: number;
  lri: number;
}

export function RoleplayMode({ session, onSession, onAgain }: { session: RoleplaySession; onSession: (s: RoleplaySession) => void; onAgain: () => void }) {
  const { t, fmt, err, pick } = usePrefs();
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<Array<{ line: string; coach: Coach }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const stt = useSpeechToText((s) => setText((x) => (x ? `${x} ${s}` : s)));
  const lastPartner = [...session.transcript].reverse().find((l) => l.role === "partner")?.text ?? "";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [session.transcript.length]);

  async function send() {
    if (!text.trim()) return;
    stt.stop();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ coach: Coach; partnerReply: string; session: RoleplaySession }>("/api/practice", { action: "roleplay.turn", sessionId: session.id, text });
      setNotes((n) => [{ line: text, coach: r.coach }, ...n]);
      setText("");
      setActive(null);
      onSession(r.session);
      speakOnce(r.partnerReply, 0.9);
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  }

  const latest = notes[0];
  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
      <div className="rounded-lg border border-line bg-card">
        {session.scenario && (
          <div className="border-b border-line p-4">
            <p className="text-[15px] font-semibold">{pick(session.scenario.titleEn, session.scenario.titleVi)}</p>
            <p className="text-[13px] text-ink-3">{pick(session.scenario.setupEn, session.scenario.setupVi)}</p>
            <p className="num mt-1 text-[12px] text-ink-3">{fmt(t.practice.turnOf, { n: Math.min(session.userTurns + 1, session.maxTurns), max: session.maxTurns })}</p>
          </div>
        )}
        <div className="max-h-[52vh] space-y-3 overflow-y-auto p-4" aria-live="polite">
          {session.transcript.map((l, i) => (
            <div key={i} className={cn("flex", l.role === "learner" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-lg px-3.5 py-2.5 text-[15px] leading-relaxed", l.role === "learner" ? "bg-ink text-canvas" : "bg-surface text-ink")}>
                {l.text}
                {l.role === "partner" && (
                  <button type="button" onClick={() => speakOnce(l.text, 0.9)} aria-label={t.practice.listen} className="ml-2 inline-flex align-middle text-ink-3 hover:text-ink"><Volume2 className="size-3.5" aria-hidden /></button>
                )}
              </div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        {session.finished ? (
          <div className="border-t border-line p-4">
            <p className="text-[13.5px] text-ink-2">{t.practice.conversationOver}</p>
            <div className="mt-3"><SessionDone score={session.score} onAgain={onAgain} /></div>
          </div>
        ) : (
          <div className="border-t border-line p-3">
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={submitOnModEnter(() => void send())} onPaste={(e) => e.preventDefault()} rows={2} spellCheck={false} autoCorrect="off" placeholder={t.practice.yourTurn} aria-label={t.practice.yourTurn} disabled={busy} className="w-full resize-none rounded-md border border-line bg-canvas px-3 py-2.5 text-[15px] outline-none focus:border-accent/60" />
            <div className="mt-2 flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => speakOnce(lastPartner, 0.8)}><Volume2 aria-hidden /> 0.8×</Button>
              {stt.supported && (
                <Button variant={stt.listening ? "danger" : "outline"} size="sm" onClick={stt.listening ? stt.stop : stt.start} disabled={busy}>
                  <Mic aria-hidden /> {stt.listening ? t.practice.stopMic : t.practice.speakReply}
                </Button>
              )}
              <Button className="ml-auto" onClick={() => void send()} disabled={busy || !text.trim()}>{busy ? t.common.checking : t.practice.send} <ArrowRight aria-hidden /></Button>
            </div>
            {error && <p role="alert" className="mt-2 text-[13px] text-critical-ink">{error}</p>}
          </div>
        )}
      </div>
      <aside className="rounded-lg border border-line bg-card p-4" aria-label={t.practice.coach}>
        <p className="text-[15px] font-semibold">{t.practice.coach}</p>
        {!latest ? (
          <p className="mt-2 text-[13px] text-ink-3">{t.practice.coachEmpty}</p>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="font-serif text-[15.5px] text-ink-2">“{latest.line}”</p>
            <p className="text-[13.5px] text-ink">{pick(latest.coach.coachEn, latest.coach.coachVi)}</p>
            {latest.coach.errors.length > 0 && <ErrorCards errors={latest.coach.errors} active={active} onSelect={setActive} />}
            <div className="rounded-md bg-mastered-wash p-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-mastered-ink">{t.practice.native}</p>
              <p className="mt-1 font-serif text-[16px] text-ink">{latest.coach.nativeVersion}</p>
            </div>
            <p className="num text-[12px] text-ink-3">GAI {latest.coach.gai.toFixed(0)} · LRI {latest.coach.lri.toFixed(0)}</p>
            {notes.slice(1).length > 0 && (
              <details>
                <summary className="cursor-pointer text-[12.5px] text-ink-3">+{notes.length - 1}</summary>
                <ul className="mt-2 space-y-2">
                  {notes.slice(1).map((n, i) => (
                    <li key={i} className="text-[13px]"><span className="text-ink-3">“{n.line}”</span> → <span className="font-serif text-ink">{n.coach.nativeVersion}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
