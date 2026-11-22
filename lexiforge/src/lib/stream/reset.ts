/**
 * Per-stream full reset: deletes every learning record owned by ONE stream in a single transaction.
 * The StreamAccount row (and so the session cookie) stays; shared tables and other streams are never touched.
 */
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/http";

export interface ResetResult {
  deleted: Record<string, number>;
  preservedLanguage: string | null;
}

export async function resetStreamData(stream: { id: string; code: string }, input: { confirmCode: string; preserveLanguage?: boolean }): Promise<ResetResult> {
  if (input.confirmCode.trim() !== stream.code) throw new AppError(400, "RESET_CONFIRM_MISMATCH", "Type your exact stream code to confirm.");
  const streamId = stream.id;
  const settings = await prisma.userSettings.findUnique({ where: { streamId }, select: { uiLocale: true } });
  const keepLocale = input.preserveLanguage === true ? (settings?.uiLocale ?? null) : null;
  // Children first (explicit order, even though most relations also cascade).
  const results = await prisma.$transaction([
    prisma.srsReview.deleteMany({ where: { streamId } }),
    prisma.foundationProgress.deleteMany({ where: { streamId } }),
    prisma.srsCard.deleteMany({ where: { streamId } }),
    prisma.errorLog.deleteMany({ where: { streamId } }),
    prisma.submissionAttempt.deleteMany({ where: { streamId } }),
    prisma.lexicalChunk.deleteMany({ where: { streamId } }),
    prisma.lessonUnit.deleteMany({ where: { streamId } }),
    prisma.practiceSession.deleteMany({ where: { streamId } }),
    prisma.diagnosticAssessment.deleteMany({ where: { streamId } }),
    prisma.proficiencySnapshot.deleteMany({ where: { streamId } }),
    prisma.proficiencyProfile.deleteMany({ where: { streamId } }),
    prisma.roadmapMilestone.deleteMany({ where: { streamId } }),
    prisma.learningGoal.deleteMany({ where: { streamId } }),
    prisma.userProgress.deleteMany({ where: { streamId } }),
    prisma.userSettings.deleteMany({ where: { streamId } }),
    ...(keepLocale ? [prisma.userSettings.create({ data: { streamId, uiLocale: keepLocale } })] : []),
  ]);
  const names = ["SrsReview", "FoundationProgress", "SrsCard", "ErrorLog", "SubmissionAttempt", "LexicalChunk", "LessonUnit", "PracticeSession", "DiagnosticAssessment", "ProficiencySnapshot", "ProficiencyProfile", "RoadmapMilestone", "LearningGoal", "UserProgress", "UserSettings"];
  const deleted: Record<string, number> = {};
  names.forEach((n, i) => {
    deleted[n] = (results[i] as { count: number }).count;
  });
  return { deleted, preservedLanguage: keepLocale };
}
