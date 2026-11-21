import type { CompletionRequest, LlmClient } from "@/lib/llm/client";

/** Deterministic LLM double for tests: replies are produced by a function of the request (or a queue). */
export class ScriptedLlm implements LlmClient {
  readonly provider = "test" as const;
  readonly model = "scripted";
  readonly calls: CompletionRequest[] = [];
  private queue: Array<string | ((req: CompletionRequest) => string)>;
  constructor(replies: Array<string | ((req: CompletionRequest) => string)>) {
    this.queue = [...replies];
  }
  async complete(req: CompletionRequest): Promise<string> {
    this.calls.push(req);
    const next = this.queue.length > 1 ? this.queue.shift() : this.queue[0];
    if (next === undefined) throw new Error("ScriptedLlm exhausted");
    return typeof next === "function" ? next(req) : next;
  }
}

/** Extracts the learner text between <<< and >>> from an evaluator prompt. */
export function learnerText(req: CompletionRequest): string {
  const m = /<<<([\s\S]*?)>>>/.exec(req.user);
  return m?.[1] ?? "";
}

export function errorFor(text: string, original: string, rest: Record<string, unknown>) {
  const start = text.indexOf(original);
  return { original, start, end: start + original.length, ruleEn: "Rule explanation.", ruleVi: "Giải thích quy tắc.", correction: "fix", ...rest };
}
