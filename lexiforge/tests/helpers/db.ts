import { prisma } from "@/lib/db";

/** Deletes all rows (FK-safe order). Each DB test file calls this in beforeEach. */
export async function resetDb() {
  await prisma.srsReview.deleteMany();
  await prisma.srsCard.deleteMany();
  await prisma.errorLog.deleteMany();
  await prisma.submissionAttempt.deleteMany();
  await prisma.lexicalChunk.deleteMany();
  await prisma.lessonUnit.deleteMany();
  await prisma.dailyArticle.deleteMany();
  await prisma.sourceFeed.deleteMany();
  await prisma.proficiencySnapshot.deleteMany();
  await prisma.proficiencyProfile.deleteMany();
  await prisma.diagnosticAssessment.deleteMany();
  await prisma.userSettings.deleteMany();
  await prisma.userProgress.deleteMany();
  await prisma.user.deleteMany();
}
