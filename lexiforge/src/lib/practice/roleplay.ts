/** Real-life micro-roleplay: level-matched scenarios + a strict coach that inspects every learner turn. */

import { z } from "zod";
import { generateStructured } from "@/lib/llm/structured";
import type { LlmClient } from "@/lib/llm/client";
import { EDITOR_PERSONA, ERROR_TAXONOMY, JSON_ONLY, findBannedPraise } from "@/lib/llm/prompts";
import { audienceInstructions, type Audience } from "@/lib/evaluation/evaluator";
import { EvidenceErrorSchema, type EvidenceError } from "@/lib/evaluation/schemas";
import { repairSpans } from "@/lib/evaluation/spans";
import type { LevelGroup } from "./content";

export interface Scenario {
  id: string;
  groups: LevelGroup[];
  titleVi: string;
  titleEn: string;
  setupVi: string;
  setupEn: string;
  partnerRole: string;
  /** Partner's first line. "{headline}" is replaced with today's real headline. */
  opener: string;
}

export const MAX_USER_TURNS = 6;
export const MIN_USER_TURNS = 4;

export const SCENARIOS: readonly Scenario[] = [
  { id: "greet", groups: ["BEGINNER"], titleVi: "Chào hỏi & giới thiệu", titleEn: "Greetings & introductions", setupVi: "Bạn gặp một đồng nghiệp mới ở văn phòng.", setupEn: "You meet a new colleague at the office.", partnerRole: "a friendly new colleague", opener: "Hi! I'm Sam. I'm new here. What's your name?" },
  { id: "food", groups: ["BEGINNER", "ELEMENTARY"], titleVi: "Gọi đồ ăn", titleEn: "Ordering food", setupVi: "Bạn ở một quán cà phê và muốn gọi đồ.", setupEn: "You are at a café and want to order.", partnerRole: "a café server", opener: "Good morning! What can I get for you today?" },
  { id: "directions", groups: ["BEGINNER", "ELEMENTARY"], titleVi: "Hỏi đường", titleEn: "Asking for directions", setupVi: "Bạn bị lạc và cần tìm ga tàu gần nhất.", setupEn: "You are lost and need the nearest train station.", partnerRole: "a helpful local", opener: "You look a bit lost. Can I help you?" },
  { id: "shopping", groups: ["BEGINNER", "ELEMENTARY"], titleVi: "Mua sắm", titleEn: "Shopping", setupVi: "Bạn muốn mua một chiếc áo khoác vừa size.", setupEn: "You want to buy a jacket in your size.", partnerRole: "a shop assistant", opener: "Hello! Are you looking for anything special today?" },
  { id: "weekend", groups: ["ELEMENTARY", "INTERMEDIATE"], titleVi: "Kể chuyện cuối tuần", titleEn: "Talking about your weekend", setupVi: "Một người bạn hỏi bạn đã làm gì cuối tuần trước.", setupEn: "A friend asks what you did last weekend.", partnerRole: "a curious friend", opener: "Hey! How was your weekend? Did you do anything fun?" },
  { id: "interview", groups: ["INTERMEDIATE", "ADVANCED"], titleVi: "Phỏng vấn xin việc", titleEn: "Job interview", setupVi: "Bạn đang phỏng vấn cho vị trí bạn mong muốn.", setupEn: "You are interviewing for a job you want.", partnerRole: "a hiring manager", opener: "Thanks for coming in. Could you tell me a little about yourself and why you applied?" },
  { id: "meeting", groups: ["INTERMEDIATE", "ADVANCED"], titleVi: "Họp công việc", titleEn: "Work meeting", setupVi: "Bạn cập nhật tiến độ dự án và đề xuất bước tiếp theo.", setupEn: "You update your team on a project and propose next steps.", partnerRole: "your team lead", opener: "Let's start. Where are we with the project, and is anything blocking you?" },
  { id: "news-debate", groups: ["ADVANCED"], titleVi: "Tranh luận tin tức hôm nay", titleEn: "Debating today's news", setupVi: "Tranh luận về một tin thật hôm nay với người có quan điểm ngược lại.", setupEn: "Debate a real story from today with someone who disagrees.", partnerRole: "a sharp sparring partner who takes the opposite side", opener: "Did you see this today: \"{headline}\"? Honestly, I think it's a mistake. Convince me otherwise." },
  { id: "negotiation", groups: ["ADVANCED"], titleVi: "Đàm phán", titleEn: "Negotiation", setupVi: "Bạn đàm phán lại giá và thời hạn hợp đồng với một đối tác.", setupEn: "You renegotiate price and deadline with a supplier.", partnerRole: "a tough supplier", opener: "We've reviewed your request. To be frank, we can't lower the price. What did you have in mind?" },
];

export function scenariosFor(group: LevelGroup): Scenario[] {
  return SCENARIOS.filter((s) => s.groups.includes(group));
}

export const RoleplayTurnSchema = z.object({
  partnerReply: z.string().min(1).max(600),
  errors: z.array(EvidenceErrorSchema).max(20),
  nativeVersion: z.string().min(1).max(600),
  coachEn: z.string().min(3).max(500),
  coachVi: z.string().min(3).max(500),
  finished: z.boolean(),
});
export type RoleplayTurn = z.infer<typeof RoleplayTurnSchema>;

export interface TranscriptLine {
  role: "partner" | "learner";
  text: string;
}

export interface CoachedTurn {
  partnerReply: string;
  errors: EvidenceError[];
  nativeVersion: string;
  coachEn: string;
  coachVi: string;
  finished: boolean;
}

/** One learner turn: the partner replies in character and the coach audits the learner's sentence. */
export async function coachTurn(opts: { scenario: Scenario; levelLabel: string; beginner: boolean; transcript: TranscriptLine[]; learnerText: string; userTurn: number; audience: Audience; client?: LlmClient }): Promise<CoachedTurn> {
  const history = opts.transcript.map((l) => `${l.role === "partner" ? "PARTNER" : "LEARNER"}: ${l.text}`).join("\n");
  let spans: ReturnType<typeof repairSpans> | null = null;
  const out = await generateStructured({
    schema: RoleplayTurnSchema,
    system: EDITOR_PERSONA,
    user: `ROLEPLAY (${opts.scenario.titleEn}). You play ${opts.scenario.partnerRole}. Learner level: CEFR ${opts.levelLabel}.
Partner reply rules: stay in character, natural spoken English, ${opts.beginner ? "very short (≤ 15 words), simple words, ask one easy question" : "≤ 45 words, keep the conversation moving with one question"}.
Set "finished": true only when the conversation has reached a natural end AND this is learner turn ≥ ${MIN_USER_TURNS} (this is learner turn ${opts.userTurn} of max ${MAX_USER_TURNS}).

COACH (strict): audit ONLY the learner's latest message. Report every error with exact offsets; "nativeVersion" = how a native speaker would say the same thing; "coachVi"/"coachEn" = the single most important fix, no praise.
${ERROR_TAXONOMY}
${audienceInstructions(opts.audience)}

CONVERSATION SO FAR:
${history}

LEARNER'S LATEST MESSAGE (offsets start at 0):
<<<${opts.learnerText}>>>

JSON: {"partnerReply","errors":[{"original","start","end","correction","category","subtype","severity","ruleEn","ruleVi"}],"nativeVersion","coachEn","coachVi","finished"}
${JSON_ONLY}`,
    tier: "standard",
    client: opts.client,
    validate: (v) => {
      const praise = findBannedPraise(`${v.coachEn} ${v.coachVi}`);
      if (praise) return `Remove praise ("${praise}").`;
      const r = repairSpans(opts.learnerText, v.errors);
      if (v.errors.length > 0 && r.dropped.length / v.errors.length > 0.3) return `These "original" strings are not in the learner message: ${r.dropped.map((d) => JSON.stringify(d.original)).join(", ")}`;
      spans = r;
      return null;
    },
  });
  const repaired = spans ?? repairSpans(opts.learnerText, out.errors);
  return {
    partnerReply: out.partnerReply,
    errors: repaired.errors,
    nativeVersion: out.nativeVersion,
    coachEn: out.coachEn,
    coachVi: out.coachVi,
    finished: out.finished && opts.userTurn >= MIN_USER_TURNS,
  };
}
