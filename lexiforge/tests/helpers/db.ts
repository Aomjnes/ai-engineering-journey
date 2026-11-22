import { prisma } from "@/lib/db";

const TABLES = [
  "StreamAccount", "SourceFeed", "DailyArticle", "ExplanationCache", "AccessFailure",
  "UserSettings", "UserProgress", "LessonUnit", "LexicalChunk", "SubmissionAttempt", "ErrorLog", "SrsCard", "SrsReview",
  "ProficiencyProfile", "ProficiencySnapshot", "DiagnosticAssessment", "LearningGoal", "RoadmapMilestone", "PracticeSession", "FoundationProgress",
];

/** Empties every table (each DB test file calls this in beforeEach). */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

/** Creates (or returns) a stream account the way /api/stream/enter does. */
export async function testStream(code = "000") {
  return prisma.streamAccount.upsert({
    where: { code },
    update: {},
    create: { code, label: `Stream ${code}`, settings: { create: {} }, progress: { create: {} } },
  });
}
