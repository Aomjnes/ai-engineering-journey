import { prisma } from "@/lib/db";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locale";
import { isBeginnerBand, type SubBand } from "@/lib/metrics/scoring";
import type { Audience } from "@/lib/evaluation/evaluator";

/** The stream's UI / feedback language (UserSettings.uiLocale, default Vietnamese). */
export async function streamLocale(streamId: string): Promise<Locale> {
  const s = await prisma.userSettings.findUnique({ where: { streamId }, select: { uiLocale: true } });
  return isLocale(s?.uiLocale) ? s.uiLocale : DEFAULT_LOCALE;
}

/** Feedback audience for LLM coaching: language + whether to use the beginner (Pre-A1/A1) style. */
export async function streamAudience(streamId: string): Promise<Audience> {
  const [locale, profile] = await Promise.all([
    streamLocale(streamId),
    prisma.proficiencyProfile.findUnique({ where: { streamId }, select: { subBand: true } }),
  ]);
  return { locale, beginner: profile ? isBeginnerBand(profile.subBand as SubBand) : true };
}
