import { describe, expect, it } from "vitest";
import { explainSelection } from "@/lib/explain/service";
import { ScriptedLlm } from "../helpers/scripted-llm";

const good = {
  coreLogic: { plainEnglish: "People said they were worried about safety.", mentalImage: "Hands raised in a meeting." },
  structure: { parts: [{ text: "Critics", role: "subject", note: "" }, { text: "have raised", role: "main verb (present perfect)", note: "" }, { text: "concerns about safety", role: "object + prepositional phrase", note: "" }], summary: "S + V + O." },
  contrastive: { vietnamese: "bày tỏ lo ngại về", nuanceVi: "Trang trọng hơn 'lo lắng'.", interferenceWarning: "Không nói 'raise concerns on'." },
  usage: { dialogue: [{ speaker: "A", line: "Any feedback?" }, { speaker: "B", line: "Yes, I'd like to raise concerns about the budget." }], textbookTrap: "raise worries for", natural: "raise concerns about", why: "Fixed collocation." },
};

describe("4-mode explainer", () => {
  it("rejects structure parts that are not in the selection and retries", async () => {
    const bad = { ...good, structure: { ...good.structure, parts: [{ text: "Opponents", role: "subject", note: "" }] } };
    const llm = new ScriptedLlm([JSON.stringify(bad), JSON.stringify(good)]);
    const out = await explainSelection("Critics have raised concerns about safety", "Critics have raised concerns about safety and maintenance.", llm);
    expect(out.contrastive.vietnamese).toBe("bày tỏ lo ngại về");
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.user).toContain("Opponents");
  });
});
