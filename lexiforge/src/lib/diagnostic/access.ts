/**
 * Who may open /onboarding. Pure so the rule is unit-tested and shared by UI and tests.
 * Allowed when not calibrated yet, when the stream has no goal/roadmap (streams placed before roadmaps existed),
 * or when the learner explicitly asks to retake (?retake=1). Otherwise the page sends them to Today.
 */
export function onboardingAccess(s: { calibrated: boolean; hasRoadmap: boolean; retake: boolean; inProgress: boolean }): "ALLOW" | "REDIRECT_HOME" {
  if (s.inProgress || s.retake || !s.calibrated || !s.hasRoadmap) return "ALLOW";
  return "REDIRECT_HOME";
}

export const isRetake = (search: string) => new URLSearchParams(search).get("retake") === "1";
