import type { SubmissionKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EvidenceError } from "./schemas";

export interface NewSubmission {
  streamId: string;
  kind: SubmissionKind;
  text: string;
  wordCount: number;
  taskDifficulty: number;
  lessonId?: string;
  diagnosticId?: string;
  questionId?: string;
  attemptNumber?: number;
  copySimilarity?: number;
  rejected?: boolean;
  rejectionReason?: string;
  evidence?: object;
  gai?: number;
  lri?: number;
  cpr?: number;
  passedGate?: boolean;
  errors?: readonly EvidenceError[];
}

/** Stores a submission and its error log atomically. */
export async function saveSubmission(s: NewSubmission) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.submissionAttempt.create({
      data: {
        streamId: s.streamId,
        kind: s.kind,
        text: s.text,
        wordCount: s.wordCount,
        taskDifficulty: s.taskDifficulty,
        lessonId: s.lessonId,
        diagnosticId: s.diagnosticId,
        questionId: s.questionId,
        attemptNumber: s.attemptNumber ?? 1,
        copySimilarity: s.copySimilarity,
        rejected: s.rejected ?? false,
        rejectionReason: s.rejectionReason,
        evidence: s.evidence,
        gai: s.gai,
        lri: s.lri,
        cpr: s.cpr,
        passedGate: s.passedGate ?? false,
      },
    });
    if (s.errors?.length) {
      await tx.errorLog.createMany({
        data: s.errors.map((e) => ({
          streamId: s.streamId,
          submissionId: sub.id,
          category: e.category,
          subtype: e.subtype,
          severity: e.severity,
          spanStart: e.start,
          spanEnd: e.end,
          original: e.original,
          correction: e.correction,
          ruleEn: e.ruleEn,
          ruleVi: e.ruleVi,
        })),
      });
    }
    return sub;
  });
}

export async function attemptCount(where: { streamId: string; lessonId?: string; diagnosticId?: string; kind: SubmissionKind; questionId?: string }) {
  return prisma.submissionAttempt.count({
    where: { streamId: where.streamId, lessonId: where.lessonId, diagnosticId: where.diagnosticId, kind: where.kind, questionId: where.questionId, rejected: false },
  });
}
