/** Test oracle for the placement staircase: answers the current unit correctly or wrongly. */
import { TIER0_ITEMS, TIER_BLOCKS } from "@/lib/diagnostic/item-bank";
import type { Answer } from "@/lib/diagnostic/placement";

export function oracleAnswer(unitId: string, tier: number, good: boolean): Answer {
  if (tier === 0) {
    const it = TIER0_ITEMS.find((i) => i.id === unitId);
    if (!it) throw new Error(`unknown tier-0 item ${unitId}`);
    if (it.kind === "WORD_ORDER") return { kind: "order", words: good ? it.sentence.split(" ") : [...it.scrambled] };
    return { kind: "choice", choice: good ? it.answer : (it.answer + 1) % it.options.length };
  }
  const block = TIER_BLOCKS[tier as 1 | 2 | 3];
  const p = block.passages.find((x) => x.id === unitId);
  if (p) return { kind: "choices", choices: p.questions.map((q) => (good ? q.answer : (q.answer + 1) % q.options.length)) };
  const e = block.errors.find((x) => x.id === unitId);
  if (!e) throw new Error(`unknown item ${unitId}`);
  return { kind: "choice", choice: good ? e.answer : (e.answer + 1) % 5 };
}
