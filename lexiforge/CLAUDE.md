# LexiForge — engineering contract

LexiForge is an English acquisition app for Vietnamese learners. It teaches from
**today's real news**, measures proficiency with **deterministic, unit-tested
math**, and never lets a lesson be completed passively.

This file is the source of truth. If code and this file disagree, the code is
wrong (or this file must be updated in the same commit).

## Verification commands (all must exit 0 before a phase is "done")

```bash
npm run typecheck      # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run lint           # eslint (next/core-web-vitals + typescript); TODO/FIXME comments are lint errors
npm test               # vitest on Postgres (lexiforge_test): metrics, isolation, pipelines (deterministic LLM double)
npm run test:live      # live RSS/Readability integration (needs network access to feed hosts)
npm run build          # prisma generate + next build
npx prisma validate && npm run db:push
```

## Architecture

```
src/
  app/                    Next.js App Router (UI pages + /api route handlers)
  lib/
    env.ts                Zod-validated env; LLM provider auto-detect
    db.ts                 Prisma singleton
    http.ts               API route helpers (Zod body parsing, typed JSON errors)
    llm/                  Provider-agnostic client (Anthropic SDK / OpenAI SDK / Google GenAI SDK)
                          + `generateStructured()` = JSON → Zod validate → retry with error feedback
    metrics/              PURE deterministic math. No I/O, no LLM, no Date.now() (time is a parameter).
      text.ts             tokenizer, sentence splitter, syllable counter, n-grams
      core-vocab.ts       ~1.6k high-frequency English lemmas (the "core band")
      readability.ts      Flesch-Kincaid, lexical sophistication, difficulty score, CEFR tier
      scoring.ts          GAI, LRI, CPR, RSS, ERI, composite, EWMA, sub-band/IELTS mapping, promotion & decay
      similarity.ts       copy-paste detector (word-trigram Jaccard)
      srs.ts              FSRS-4.5 scheduler
      irt.ts              1PL (Rasch) MAP ability estimate for the placement audit
    ingest/               RSS fetch → Readability extraction → URL-hash dedupe → complexity tagging
    lessons/              i+1 article matching + lesson synthesis (LLM supplies text/chunks; math verifies)
    evaluation/           Strict evaluator: LLM evidence → span repair → deterministic metrics → gates
    diagnostic/           staircase placement (Tier 0–3, early exit) + band promotion audit (item bank + IRT)
    roadmap/              fixed curriculum per sub-band + deterministic milestone generator + roadmap service
    practice/             Practice Studio: dictation, speaking/IPA, sentence builder, roleplay coach, foundation decks
    i18n/                 vi/en dictionaries (generated), getDictionary, fmt, error/subtype labels, locale cookie
    accountability/       Error Graveyard aggregation, half-life, Error Detox lock
    profile/              Applies session results to ProficiencyProfile + snapshots (EWMA, decay, gates)
  components/             UI (shadcn-style primitives in components/ui)
prisma/schema.prisma      complete schema; seed.ts seeds feeds + local user
tests/                    vitest (unit) and tests/integration (live network)
```

## Data & streams (PostgreSQL)

- Database: PostgreSQL (Neon / Supabase). `DATABASE_URL` = pooled runtime URL, `DIRECT_URL` = direct URL for
  `prisma db push`. No SQLite anywhere. Tests use a dedicated `lexiforge_test` database (dropped/recreated per run).
- **Streams:** up to `MAX_STREAMS = 5` `StreamAccount` rows, one per private access code in `ALLOWED_STREAM_CODES`
  (default `000,001,002,003,004`, max 5 entries). Codes are never listed; only the label is editable.
- **Shared tables** (no learner data): `SourceFeed`, `DailyArticle`, `ExplanationCache`, `AccessFailure`.
- **Isolated tables** (every row has `streamId` → `StreamAccount`, `onDelete: Cascade`, indexed): `ProficiencyProfile`,
  `ProficiencySnapshot`, `DiagnosticAssessment`, `LessonUnit` (`@@unique([streamId, articleId])`), `LexicalChunk`,
  `UserProgress`, `SubmissionAttempt`, `ErrorLog`, `SrsCard`, `SrsReview`, `UserSettings`, `LearningGoal`
  (`streamId @unique`), `RoadmapMilestone` (`@@unique([streamId, orderIndex])`), `PracticeSession`,
  `FoundationProgress` (`@@unique([streamId, deckId, itemKey])`).
- **Isolation invariant:** every Prisma call on an isolated model includes `streamId` in its `where`/`data`
  (single-row reads use `findFirst({ where: { id, streamId } })`, updates use `where: { id, streamId }`).
  `tests/security/scope-audit.test.ts` statically fails the suite if any call omits it.
- **Sessions:** `POST /api/stream/enter` validates the code (10 failures / 15 min / IP → 429, stored in
  `AccessFailure` so it works across serverless instances), lazily creates the stream, and sets `lexiforge_stream`
  = base64url(payload).HMAC-SHA256(SESSION_SECRET), HttpOnly, SameSite=Lax, Secure in production, 30 days.
  `src/middleware.ts` verifies the signature on every non-public route (pages → redirect `/access`, APIs → 401);
  route handlers call `requireStream(req)`, which re-verifies and loads the stream (revoked codes → 401).
  Public: `/access`, `/api/stream/enter`, `/api/stream/logout`, `/api/cron/ingest` (CRON_SECRET or session).
- **Cross-device sync:** all user routes are `force-dynamic` and fetched with `cache: "no-store"`; the client
  re-pulls state on `visibilitychange`/`focus` (`useCrossDeviceSync`). localStorage keys are
  `lexiforge:${streamId}:…` so streams on one device never share drafts or UI state.

## LLM thinking tiers & explainer latency

- `CompletionRequest.tier`: `minimal` (explainer) · `standard` (lesson synthesis, question sets) ·
  `thorough` (evaluate, diagnostic, promotion audit — never lowered).
  Gemini 3+: `thinkingLevel` MINIMAL / LOW / HIGH; Gemini 2.5: `thinkingBudget` 0 (Pro 128) / 2048 / dynamic.
  Anthropic: effort low / medium / high (adaptive thinking). OpenAI reasoning models: effort minimal / medium / high.
- `/api/explain`: tier `minimal`, temperature 0.2, `maxOutputTokens` 3000, concise prompt including the learner's
  CEFR level. Results are cached in `ExplanationCache` keyed by
  sha256(normalized selection | first 240 chars of normalized context | CEFR level); hits return in milliseconds
  (`X-Explain-Cache: HIT`). The lesson workspace also keeps an in-memory Map per page.
- Measured on gemini-3.5-flash (free tier): explainer 1–2 min before → ~8 s uncached, ~4 ms cached;
  thorough evaluation 40–64 s (hence 300 s `maxDuration` on grading routes).

## Deployment (Vercel)

- Project root directory: `lexiforge/` (holds `vercel.json`). Build: `npm run vercel-build` (additive `prisma db push`, seed, `next build`).
- Functions run in `sin1` (Singapore), co-located with the Neon database, so each query is a few ms instead of a trans-Pacific round trip.
- Vercel Cron: `GET /api/cron/ingest` daily at `0 22 * * *` (05:00 Hanoi), `Authorization: Bearer $CRON_SECRET`.
  `node-cron` never starts when `VERCEL=1`.
- `maxDuration`: explain & cron 60 s; evaluate, diagnostic, lessons/synthesize, practice 300 s.

## Pedagogical invariants (never violate)

1. **No self-reported level.** A user without a completed PLACEMENT `DiagnosticAssessment`
   is redirected to `/onboarding`; lesson/evaluate APIs return 409 `CALIBRATION_REQUIRED`.
2. **The LLM never produces numbers that become scores.** It returns evidence only
   (error spans, severity, category, subtype, rubric booleans, chunk-usage booleans).
   All scores come from `src/lib/metrics/`. LLM output is Zod-validated and retried (max 3).
3. **No vanity gamification.** No XP, gems, streak counters, or confetti.
4. **No sycophancy.** The evaluator prompt forbids praise; any output containing banned
   phrases (`BANNED_PRAISE` in `lib/llm/prompts.ts`) is rejected and retried.
5. **No passive completion.** Lesson stages are strictly ordered INPUT → COMPREHENSION →
   PRODUCTION → EXIT_TICKET → COMPLETED; the server refuses out-of-order submissions.
6. **Copy-paste is rejected deterministically** (Jaccard > 0.65, see below) before any LLM call.
7. **Error-Repair Gate.** Any CRITICAL error, or ≥ 2 MODERATE errors, blocks progression.
   The learner must rewrite; the native upgrade is never offered as a one-click fix, and a
   rewrite that is a near-copy of the upgrade (trigram Jaccard ≥ 0.9) is rejected.
8. **Honest decay.** Levels are never inflated; missed reviews lower RSS through FSRS
   retrievability; prolonged inactivity lowers the ability estimate.
9. **Accountability lock.** Overdue SRS or recurring-error debt above threshold locks new
   lessons behind a ≥ 5-minute Error Detox (server-timed).

## Metric formulas (implemented in `src/lib/metrics/scoring.ts`)

Severity weights: `CRITICAL = 3`, `MODERATE = 1.5`, `MINOR = 0.5`. `W` = word count.

### GAI — Grammatical Accuracy Index (0–100)
Counts errors in `GRAMMAR` and `SPELLING_PUNCTUATION`.
- Weighted errors per 100 words: `E100 = 100 · Σ wᵢ / max(W, 20)` (`SHORT_TEXT_FLOOR = 20`, so one slip in a
  5-word beginner answer is not "20 errors / 100 words"; the raw E/100W chart still uses `max(W, 1)`)
- Density component: `Dens = 100 · exp(−E100 / 10)`
- Error-free sentence ratio: `EFSR = error-free sentences / sentences`
  (a sentence is erroneous if any counted error span overlaps it)
- `GAI = 0.6 · Dens + 0.4 · 100 · EFSR`

### LRI — Lexical Resource & Naturalness Index (0–100)
- Chunk deployment rate: `CDR = 100 · chunks used correctly / chunks required`
  (a chunk counts only if the LLM marks it correct AND it is deterministically found in the text)
- Guiraud's Index `R = types / √tokens` (content-insensitive, lowercased word tokens);
  `G_R = 100 · clamp((R − 3) / 6, 0, 1)`. Below `GUIRAUD_MIN_TOKENS = 30` tokens R is unstable, so
  `G = w · G_R + (1 − w) · G_T` with `w = n / 30` and `G_T = 100 · clamp((TTR − 0.6) / 0.4, 0, 1)`; empty text → 0.
- Collocation naturalness: `Σw_lex` = weighted `COLLOCATION_NATURALNESS` + `WORD_CHOICE_REGISTER` errors;
  `CNR = 100 · clamp(1 − Σw_lex / max(W / 10, 1), 0, 1)`
- `LRI = 0.35 · CDR + 0.30 · G + 0.35 · CNR`; with no required chunks the weights renormalize to
  `G · 0.30/0.65 + CNR · 0.35/0.65`.

### CPR — Comprehension Precision Rate (0–100)
First attempts only. Item score = met rubric criteria / total criteria (objective items: 1 or 0).
An item with a `LOGIC_COMPREHENSION` CRITICAL error, or rejected as copy-paste, scores 0.
`CPR = 100 · mean(item scores)`.

### RSS — Retention Stability Score (0–100)
From `SrsReview` history and current FSRS state at time `now`:
- `R7`  = Laplace-smoothed recall rate of reviews with elapsed ≥ 7 days and < 30: `(recalled + 1) / (n + 2)`
- `R30` = same for elapsed ≥ 30 days
- `Hist = 0.4 · R7 + 0.6 · R30` (if only one bucket has data, it takes full weight)
- `Now  = mean FSRS retrievability R(t, S)` over all non-NEW cards at `now` (falls when reviews are missed)
- `RSS = 100 · (0.5 · Hist + 0.5 · Now)`. With zero mature reviews, `RSS = 100 · Now` and
  `rssReviews = 0` marks it low-evidence; with zero reviewed cards RSS is excluded from the composite.

### ERI — Error Recurrence Index (0–100, higher = errors decaying) & Error Half-Life
- A **recurrence** is an error whose `subtype` already occurred in an earlier session.
- `RecDensity` = weighted recurrences per 100 words over the last 14 days of production.
- `ERI = 100 · exp(−RecDensity / 4)`
- **Half-life per subtype:** least-squares fit of `ln(rate + 0.5)` vs. session time (days), where
  `rate` = weighted occurrences per 100 words in each session. `slope < 0 ⇒ h = ln 2 / −slope` days;
  otherwise `h = ∞` (not decaying). Needs ≥ 3 sessions.
- **ERI gate:** over the last 5 production sessions, no subtype may appear at CRITICAL severity in
  more than 2 sessions (`RECURRENCE_CEILING = 2`).

### Composite Mastery Score
`C = 0.30·GAI + 0.25·LRI + 0.20·CPR + 0.15·RSS + 0.10·ERI`, weights renormalized over the
dimensions that have evidence.

### Ability level, CEFR sub-band, IELTS estimate
Level scale `L ∈ [0, 100]`, 11 sub-bands (Zero-to-Hero):
`Pre-A1 [0,15) · A1.1 [15,25) · A1.2 [25,34) · A2.1 [34,44) · A2.2 [44,53) · B1.1 [53,61) · B1.2 [61,69) · B2.1 [69,76) · B2.2 [76,83) · C1.1 [83,90) · C1.2 [90,100]`.
Pre-A1 … A1.2 are *beginner bands* (`isBeginnerBand`): micro-story lessons, Vietnamese-first coaching, 2 questions.
Article/task difficulty `D` uses the same scale.

- **Performance-implied level:** `L* = clamp(D + 0.5 · (P − 70), 0, 100)` where `P` is the session
  composite on a task of difficulty `D` (scoring 70 on a D-task means you are at D).
- **Difficulty-adjusted EWMA:** `L ← L + α · m · (L* − L)` with `α = 0.25` and task-difficulty
  multiplier `m = 1 + min(|D − L| / 25, 1)` when the outcome is *surprising* (passing above level:
  `D > L ∧ P ≥ 70`; failing below level: `D < L ∧ P < 70`), else `m = 1`.
  Live metric scores (GAI/LRI/CPR) use plain EWMA with `α = 0.3`.
- **IELTS estimate:** stepwise per sub-band: `Pre-A1 2.5 (shown "< 3.0") · A1.1 3.0 · A1.2 3.5 · A2.1 4.0 · A2.2 4.5 ·
  B1.1 5.0 · B1.2 5.5 · B2.1 6.0 · B2.2 6.5 · C1.1 7.0/7.5 · C1.2 8.0/8.5` (C1 sub-bands split at the band midpoint).
  Confidence: `SE = 1 / √(1 + words/150 + items/10)` bands; interval `± max(0.5, round½(1.96·SE))`,
  clamped to [2.5, 8.5]. Always labeled *estimated diagnostic equivalent*.

### Promotion lock (displayed sub-band only moves through gates)
Qualifying-session thresholds by current sub-band (composite `C`):
`Pre-A1 54 · A1.1 56 · A1.2 58 · A2.1 60 · A2.2 63 · B1.1 66 · B1.2 69 · B2.1 72 · B2.2 75 · C1.1 78 · C1.2 81`.
A session qualifies iff `C ≥ threshold` AND `D ≥ lower bound of current sub-band` AND it passed the
Error-Repair Gate on first submission. A non-qualifying session resets the counter to 0.
The Band Promotion Audit unlocks iff:
1. `consecutiveQualifying ≥ 5`,
2. ERI gate passes,
3. RSS ≥ 60 when RSS has evidence.
The audit (zero hints, next-band text) passes iff audit composite (GAI/LRI/CPR) ≥ the target band's
threshold AND zero CRITICAL errors. Pass → sub-band + 1, counter reset. Fail → counter reset.

### Decay & demotion
- Inactivity: for every full day beyond 7 without a graded session, `L ← L − 0.5`
  (applied lazily on dashboard load, recorded as a DECAY snapshot, at most once per day).
- Demotion: if `L` < current sub-band lower bound − (width of the band below) / 2, the sub-band drops by one
  (DEMOTION snapshot).

## Readability & article tiering (`readability.ts`)
- `FKGL = 0.39 · (words / sentences) + 11.8 · (syllables / words) − 15.59`
- `FRE  = 206.835 − 1.015 · (words / sentences) − 84.6 · (syllables / words)`
- Lexical sophistication `LS` = share of alphabetic tokens (len ≥ 3) whose lemma is not in the core band.
- Raw complexity `X = clamp(60 · clamp((FKGL − 4) / 12, 0, 1) + 40 · clamp((LS − 0.05) / 0.30, 0, 1), 0, 100)`
- Difficulty `D = levelFromRaw(X)`: piecewise-linear through `(0,15) (12.5,34) (25,53) (50,69) (75,83) (100,100)`,
  i.e. onto the shared level scale (any real text is ≥ A1.1).
- Tier: `A2 < 53 ≤ B1 < 69 ≤ B2 < 83 ≤ C1`. Ingestion discards articles with `D < 45` (too thin to teach from).

## i+1 matching (`lessons/match.ts`)
Target difficulty `T = L + 10`. Pick today's unused article minimizing `|D − T|` (ties: newest).
- `L < 34` (Pre-A1 … A1.2): **micro real-world story** — 4–6 sentences, 50–90 words, on today's real headline
  (source badge, date and original headline shown), `D ≤ T + 8`, 6–24 verbatim Vietnamese glosses (tap to reveal),
  exactly 3 survival chunks, 1 sentence pattern, 2 questions; production 8–60 words with Vietnamese cues
  (`productionPromptVi`) and a word bank for Pre-A1; TTS defaults to 0.8×.
- `34 ≤ L < 61` (A2.1 … B1.1): graded bridge version targeting `T`, accepted only if `D ≤ T + 8` (max 3 attempts),
  shown alongside the authentic excerpt.
- `61 ≤ L < 69` (B1.2): authentic text if `D ≤ T + 12`, otherwise bridge.
- `L ≥ 69` (B2+): authentic text, C1-level lexical targets.
- Comprehensibility estimate = share of tokens whose lemma is core-band or in the learner's SRS deck;
  reported on the lesson, target 0.85–0.90.

## Copy-paste detector (`similarity.ts`)
Word-trigram sets (lowercased, punctuation stripped). Against every window of 1–3 consecutive source
sentences compute Jaccard `|A∩S| / |A∪S|`; `maxJaccard > 0.65 ⇒ reject`. Answers with < 3 tokens use
unigram sets.

## SRS (`srs.ts`) — FSRS-4.5, default weights, target retention 0.9
`R(t,S) = (1 + 19/81 · t/S)^−0.5`; interval `I = S` days at r = 0.9 (rounded, min 1).
Exit-ticket cards are created only for chunks whose exit sentence passed the evaluator.
Review rating is deterministic from typed recall: exact = Good (3), Levenshtein ≤ 2 = Hard (2),
otherwise Again (1); Easy (4) only if exact and answered in < 6 s.

## Lesson stages (`lessons/flow.ts`)
- **Stage 1 INPUT:** read + TTS + 4-mode explainer; advances only after a shadowing transcript (typed or STT) of a
  deterministically chosen sentence reaches word-level accuracy ≥ 80% (`dictationAccuracy`).
- **Stage 2 COMPREHENSION:** 3 open questions with fixed rubrics (never sent to the client). Copy-paste is rejected
  before any LLM call and still counts as that question's first attempt (score 0). A question passes at
  ≥ 50% rubric criteria without a critical misreading; CPR uses first attempts only.
- **Stage 3 PRODUCTION:** 60–220 words, must use ≥ 3 lesson chunks correctly (LLM says correct AND chunk is
  deterministically present). LRI's CDR uses a requirement of 3. Blocked if repair gate fails, < 3 chunks, or off-prompt.
  The session is scored once, on the first attempt (`recordSession`); rewrites never change the score.
  A rewrite is rejected as a pasted upgrade when its trigram Jaccard to the native upgrade is ≥ 0.9 and exceeds its
  Jaccard to the learner's own first draft by > 0.1.
- **Stage 4 EXIT_TICKET:** one original sentence per chunk; a sentence passes when the chunk is present, used correctly,
  not copied (Jaccard ≤ 0.65 vs source), and has no MODERATE/CRITICAL error. Passed chunks become FSRS cards
  ("Today's Acquired Arsenal"); failed ones must be resubmitted. All passed → COMPLETED.

## Accountability (`accountability/`)
Detox lock iff `overdue cards ≥ 15` OR `error debt ≥ 12` OR (`last review > 7 days ago` AND overdue > 0).
Error debt = Σ severity weights of unresolved errors from the last 30 days whose subtype occurred ≥ 3 times.
Detox clears only after ≥ 300 s server time AND each of the top-3 recurring subtypes was rewritten clean
(a clean rewrite marks that subtype's earlier errors resolved). A completed detox keeps lessons unlocked for 20 h.

## Hardening rules
- `/api/evaluate` holds an in-process per-lesson lock: a second submission while one is being graded gets 409
  `SUBMISSION_IN_PROGRESS` (prevents two "first attempts").
- Stored JSON that fails its Zod schema returns 500 `DATA_CORRUPT`; unknown errors return a generic 500 without details.
- `/api/cron/ingest` needs `Authorization: Bearer $CRON_SECRET` (constant-time compare); `/api/ingest` (manual
  button) accepts same-origin browser requests only.
- Every free-text submission passes `guardSubmission` (length, English script, gibberish, repetition) before any LLM call.

## Placement staircase (`diagnostic/placement.ts`, `diagnostic/item-bank.ts`)
- **Step 0 (setup):** comfort tier 0–3, goal (A2.2 / B1.2 / B2.2 / C1.1) and daily minutes (15/30/45/60) → `LearningGoal`.
- **Tiers:** 0 Pre-A1 (listen → meaning, survival phrases, word-order chips) · 1 A1–A2 (short passages, basic mistakes)
  · 2 B1–B2 (authentic passages, Vietlish traps) · 3 C1 (nuance, register). Start = chosen comfort tier.
- After each tier block: accuracy ≥ 0.7 → climb (if unvisited), < 0.5 → descend (if unvisited), else stop.
  Tier 0 stops after 4 misses/skips within its first 5 items. If no tier reaches 0.5 and Tier 0 was visited the
  audit ends **without writing** and the level is capped at 24.9 (Pre-A1 / A1.1).
- Every item has a guilt-free "Tôi không biết / Bỏ qua câu này" (scores 0, counted as skipped).
- Writing at `max(1, highest passed tier)`: T1 8–60 words, T2 50–130, T3 80–160; writing may be skipped.
- `θ` = Rasch MAP with prior N(35, 30²); writing-implied level `Lw` maps `0.55·GAI + 0.45·LRI` from [30, 95] onto the
  task's level range; final `L = 0.65·θ + 0.35·Lw` (θ alone without writing).
- Report (Vietnamese UI): level + band name, IELTS range, strengths, top-3 blockers (writing subtypes → missed traps →
  weak sections), writing feedback, CTA to the roadmap.

## Roadmap (`roadmap/`)
- `CURRICULUM` holds one fixed step per sub-band (VI/EN title, outcome, pronunciation, chunks, sentence patterns,
  daily reading, foundation decks, recommended practice modes, unlock thresholds GAI/LRI/RSS, guided hours).
- `planMilestones(start, target)` = every sub-band step from start to target; statuses COMPLETED (band reached) /
  ACTIVE (first unreached) / LOCKED. `syncRoadmap` regenerates when start/target change and stamps `completedAt`;
  it runs after placement, every graded session, promotion and goal edits.
- Honest ETA: remaining hours (ACTIVE step reduced by progress inside the band) ÷ (`dailyMinutes`/60 · 6 days ·
  velocity), velocity = observed ÷ expected level gain over 30 days (≥ 3 snapshots over ≥ 7 days, clamped 0.5–1.5).
- Next action priority: onboarding → detox → due reviews → resume lesson → promotion audit → new lesson.
- `GET/PUT /api/roadmap` (goal edits keep history). Today shows a "Lộ trình hiện tại" widget.

## Practice Studio (`practice/`, `/practice`, `/api/practice`, `/api/practice/foundation`)
- Content is LLM-written from today's easiest real headline + the active milestone, then validated in code
  (word-count windows per level group, difficulty ≤ max(30, L + 15), IPA in slashes, distractors not in the answer).
- **Dictation:** speeds 0.7/0.85/1.0×, replay, first-letter hints, `wordDiff` (ok / misspelled / wrong / missing /
  extra); any mistake forces a lock-in retype of the exact sentence. Score = mean first-attempt accuracy → CPR evidence.
- **Speaking:** IPA + Vietnamese tip, browser STT, pass at ≥ 85% word match; clear notice when STT is unavailable.
- **Sentence builder (VI → EN):** word chips (with trap distractors) for Pre-A1/A1, typing otherwise; exact match to an
  accepted translation passes, otherwise the strict evaluator grades it; locked until correct; answer revealed only
  after 3 chip failures; passed sentences become SRS cards.
- **Roleplay:** 4–6 learner turns, level-matched scenarios, partner via TTS, input by text or STT; a strict coach logs
  every error (ErrorLog) with a native version; average GAI/LRI become low-weight evidence.
- **Foundation decks:** listen-and-type / translate recall; 2 correct recalls → FSRS card.
- Practice evidence updates GAI/LRI/CPR with `α = 0.1` (`recordPracticeEvidence`) and never moves the level directly.

## i18n (`src/lib/i18n`)
- Source of truth: `scripts/i18n/part*.py` (key → (English, Vietnamese)); `python3 scripts/i18n/build.py` generates
  `en.ts` (`as const`) and `vi.ts` (typed `Dict`, so tsc fails on a missing key). `tests/i18n/parity.test.ts` checks
  key and `{placeholder}` parity.
- Default locale `vi`. `UserSettings.uiLocale` is the per-stream source of truth; the non-HttpOnly `lexiforge_locale`
  cookie lets `/access` and `/onboarding` render Vietnamese before login. The VI/EN switch sits in the top strip,
  on `/access`, `/onboarding` and Settings; `PATCH /api/preferences` saves it.
- Client: `usePrefs()` / `useI18n()` → `{ t, fmt, err, pick, lang }`. API error codes are localized via `errorText`.
- LLM feedback: `streamAudience()` passes `{ locale, beginner }` to every evaluator/coach prompt; beginners get short,
  jargon-free Vietnamese with the 1–2 most foundational fixes first, and the UI shows the 2 most severe errors first.
  The explainer writes its prose in Vietnamese when `uiLocale = vi` (cache key adds `|vi`).
- Every metric (GAI, LRI, CPR, RSS, ERI, CEFR, IELTS) has a plain-language tooltip (`MetricInfo`): what it measures + how to improve.

## UI system (`src/components/lf`, `src/app/globals.css`)
- Fonts via `next/font/google` with the `vietnamese` subset: Newsreader (reading), Plus Jakarta Sans (UI), JetBrains Mono
  (numbers/metrics only — sentences use `tabular-nums` in the sans face).
- Colors are RGB-channel tokens in `globals.css` (`--canvas`, `--ink*`, `--accent*`, `--critical|moderate|minor|mastered*`),
  light by default, dark via `data-theme="dark"` or the OS setting. `*-ink` tokens are the AA (≥ 4.5:1) text variants.
- Severity encoding is never color-only: solid/solid/dashed underlines + labelled badges with distinct glyphs.
- Charts: one y-axis per chart (E/100W has its own chart), validated categorical palette, table view toggle.
- The native upgrade is only rendered (and only returned by the API) after the Error-Repair Gate passes; no copy-fix action exists.

## Conventions
- TypeScript strict; no `any` in `src/lib`. No TODO/FIXME comments (lint error).
- Every API route: Zod-parse input, return `{ error: { code, message } }` with a proper status.
- Metric functions are pure and take `now: Date` explicitly — tests pin time.
- LLM features degrade with a clear `LLM_NOT_CONFIGURED` (503) message; ingestion and metrics work without a key.
