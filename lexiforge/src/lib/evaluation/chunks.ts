import { lemmaCandidates, tokenize } from "@/lib/metrics/text";

const PLACEHOLDERS = new Set(["sb", "sth", "someone", "something", "somebody", "one's", "oneself", "x", "doing", "do"]);
const IRREGULAR_FORMS: Record<string, string[]> = {
  be: ["is", "are", "was", "were", "been", "being", "am", "'s", "'re"],
  have: ["has", "had", "having", "'ve"],
  do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone", "going"],
  take: ["takes", "took", "taken", "taking"],
  make: ["makes", "made", "making"],
  come: ["comes", "came", "coming"],
  get: ["gets", "got", "gotten", "getting"],
  give: ["gives", "gave", "given", "giving"],
  bring: ["brings", "brought", "bringing"],
  keep: ["keeps", "kept", "keeping"],
  hold: ["holds", "held", "holding"],
  run: ["runs", "ran", "running"],
  set: ["sets", "setting"],
  put: ["puts", "putting"],
  draw: ["draws", "drew", "drawn", "drawing"],
  fall: ["falls", "fell", "fallen", "falling"],
  rise: ["rises", "rose", "risen", "rising"],
  lead: ["leads", "led", "leading"],
  pay: ["pays", "paid", "paying"],
  break: ["breaks", "broke", "broken", "breaking"],
  shed: ["sheds", "shedding"],
  raise: ["raises", "raised", "raising"],
};

function tokenMatches(chunkToken: string, textToken: string): boolean {
  if (chunkToken === textToken) return true;
  const irregular = IRREGULAR_FORMS[chunkToken];
  if (irregular?.includes(textToken)) return true;
  const a = new Set(lemmaCandidates(chunkToken));
  return lemmaCandidates(textToken).some((c) => a.has(c));
}

/**
 * Deterministic presence check for a lexical chunk: its tokens must appear in order, allowing
 * inflection, placeholders (sb/sth/one's) and up to 3 intervening words between consecutive tokens.
 */
export function chunkPresent(text: string, chunk: string): boolean {
  const required = tokenize(chunk).filter((t) => !PLACEHOLDERS.has(t));
  if (required.length === 0) return false;
  const tokens = tokenize(text);
  for (let start = 0; start < tokens.length; start++) {
    if (!tokenMatches(required[0] as string, tokens[start] as string)) continue;
    let pos = start;
    let ok = true;
    for (let k = 1; k < required.length; k++) {
      let found = -1;
      for (let j = pos + 1; j <= Math.min(tokens.length - 1, pos + 4); j++) {
        if (tokenMatches(required[k] as string, tokens[j] as string)) {
          found = j;
          break;
        }
      }
      if (found === -1) {
        ok = false;
        break;
      }
      pos = found;
    }
    if (ok) return true;
  }
  return false;
}
