"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Web Speech API speech-to-text. `onFinal` receives each finalized phrase. */
export function useSpeechToText(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<Recognition | null>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;

  useEffect(() => setSupported(recognitionCtor() !== null), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res?.isFinal) cb.current(res[0].transcript.trim());
      }
    };
    r.onerror = (e) => setError(e.error);
    r.onend = () => setListening(false);
    ref.current = r;
    setError(null);
    r.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => ref.current?.stop(), []);
  return { supported, listening, error, start, stop };
}

/** Text-to-speech over a list of sentences with per-sentence highlight callback. */
export function useTts() {
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(typeof window !== "undefined" && "speechSynthesis" in window), []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeakingIndex(null);
  }, []);

  const speak = useCallback((sentences: string[], rate: number, from = 0) => {
    window.speechSynthesis.cancel();
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
    sentences.slice(from).forEach((text, k) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = rate;
      if (voice) u.voice = voice;
      u.onstart = () => setSpeakingIndex(from + k);
      u.onend = () => {
        if (from + k === sentences.length - 1) setSpeakingIndex(null);
      };
      window.speechSynthesis.speak(u);
    });
  }, []);

  return { supported, speakingIndex, speak, stop };
}
