import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { vi } from "@/lib/i18n/vi";
import { errorText, fmt, getDictionary, localeFromCookieHeader, subtypeLabel } from "@/lib/i18n";

type Tree = { [k: string]: string | Tree };
const keys = (o: Tree, prefix = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));
const leaves = (o: Tree, prefix = ""): Array<[string, string]> => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n dictionaries", () => {
  it("vi and en have exactly the same keys", () => {
    expect(keys(vi as unknown as Tree).sort()).toEqual(keys(en as unknown as Tree).sort());
  });

  it("every string is non-empty and uses the same {placeholders} in both languages", () => {
    const viMap = new Map(leaves(vi as unknown as Tree));
    for (const [k, enText] of leaves(en as unknown as Tree)) {
      const viText = viMap.get(k) ?? "";
      expect(enText.trim().length, k).toBeGreaterThan(0);
      expect(viText.trim().length, k).toBeGreaterThan(0);
      expect(placeholders(viText), k).toEqual(placeholders(enText));
    }
  });

  it("Vietnamese is the default and the switcher cookie is parsed safely", () => {
    expect(getDictionary()).toBe(vi);
    expect(localeFromCookieHeader(null)).toBe("vi");
    expect(localeFromCookieHeader("a=1; lexiforge_locale=en")).toBe("en");
    expect(localeFromCookieHeader("lexiforge_locale=fr")).toBe("vi");
  });

  it("covers the required UI areas, all seven metric tooltips and every sub-band", () => {
    for (const section of ["nav", "access", "onboarding", "today", "lock", "roadmap", "stage", "production", "practice", "graveyard", "metrics", "settings", "errors"]) {
      expect(Object.keys((vi as unknown as Tree)[section] as Tree).length, section).toBeGreaterThan(0);
    }
    for (const m of ["gai", "lri", "cpr", "rss", "eri", "cefr", "ielts"]) {
      for (const part of ["Name", "What", "How"]) expect((vi.metric as Record<string, string>)[`${m}${part}`], `${m}${part}`).toBeTruthy();
    }
    expect(Object.keys(vi.bands)).toHaveLength(11);
    expect(vi.nav.today).toBe("Hôm nay");
    expect(vi.common.dontKnow).toBe("Tôi không biết / Bỏ qua câu này");
  });

  it("helpers format, translate error codes and subtypes", () => {
    expect(fmt("{n} / {m}", { n: 1, m: 2 })).toBe("1 / 2");
    expect(fmt("{n} {missing}", { n: 1 })).toBe("1 {missing}");
    expect(errorText(vi, "RATE_LIMITED", "fallback")).toContain("15 phút");
    expect(errorText(vi, "SOMETHING_NEW", "fallback")).toBe("fallback");
    expect(subtypeLabel(vi, "ARTICLE_OMISSION")).toContain("mạo từ");
    expect(subtypeLabel(vi, "BRAND_NEW_SUBTYPE")).toBe("Brand new subtype");
  });
});
