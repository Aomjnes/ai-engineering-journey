/**
 * Static isolation audit: every Prisma call on a stream-owned model, anywhere in src/, must mention streamId
 * inside its argument object (where/data). Fails the build if an unscoped query is ever introduced.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ISOLATED = ["lessonUnit", "lexicalChunk", "userSettings", "userProgress", "submissionAttempt", "errorLog", "srsCard", "srsReview", "proficiencyProfile", "proficiencySnapshot", "diagnosticAssessment"];
const CALL = new RegExp(`\\b(?:prisma|tx)\\.(${ISOLATED.join("|")})\\.(\\w+)\\(`, "g");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

/** Returns the text between the call's opening paren and its matching close paren. */
function args(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

describe("stream isolation audit", () => {
  it("scopes every isolated-model Prisma query by streamId", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const file of files(join(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(CALL)) {
        checked++;
        const a = args(src, (m.index ?? 0) + m[0].length - 1);
        if (!/\bstreamId\b/.test(a)) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${m[0]}…`);
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
