"use client";

import { Segmented } from "@/components/ui/segmented";
import { usePrefs } from "./prefs";

/** VI / EN interface switch (top strip, /access, /onboarding, settings). */
export function LangSwitch({ size = "sm", className }: { size?: "sm" | "md"; className?: string }) {
  const { lang, setLang, t } = usePrefs();
  return (
    <Segmented
      label={t.shell.languageSwitch}
      size={size}
      value={lang}
      onChange={setLang}
      className={className}
      options={[
        { value: "vi", label: "VI", hint: t.shell.langViHint },
        { value: "en", label: "EN", hint: t.shell.langEnHint },
      ]}
    />
  );
}
