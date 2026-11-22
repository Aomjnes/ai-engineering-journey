# LexiForge

English acquisition from **today's real news**, with **deterministic, unit-tested proficiency tracking**.
No XP, no streaks, no self-reported level, no passive completion. The engineering contract (formulas,
invariants, test commands) is in [`CLAUDE.md`](./CLAUDE.md).

## Requirements

- Node.js **22.22+** (or 24.15+) — required by `jsdom`
- PostgreSQL 14+ (Neon or Supabase in production; any local Postgres for development)
- One LLM API key: Anthropic, OpenAI or Google Gemini
- Outbound HTTPS to the news feeds (BBC, The Guardian, NPR, Aeon, TechCrunch, The Verge, Quanta)

## Local setup

```bash
cd lexiforge
npm install
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, SESSION_SECRET, an LLM key, CRON_SECRET
npm run db:push             # creates the schema in Postgres
npm run db:seed             # seeds the 9 default RSS feeds
npm run dev                 # http://localhost:3000 → /access
```

Open the app, enter an access code (default `000`–`004`), take the placement audit, then press **Sync now**.

## Streams (5 isolated learners)

- Each access code in `ALLOWED_STREAM_CODES` (max 5, hard cap) opens one **stream**: its own profile, lessons,
  submissions, error log, SRS deck and settings. Article content and cached explanations are shared.
- Entering a code sets a signed, HttpOnly session cookie (`lexiforge_stream`, HMAC-SHA256 with `SESSION_SECRET`,
  30 days). The same code on another device shows the same stream; pages refresh when the tab regains focus.
- 10 failed codes per IP per 15 minutes are rate-limited. Codes are never listed anywhere in the UI.

## `.env`

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled Postgres URL for the app (Neon: `-pooler` host; Supabase: port 6543 `?pgbouncer=true`). |
| `DIRECT_URL` | yes | Direct (non-pooled) Postgres URL, used by `prisma db push`. |
| `SESSION_SECRET` | yes | ≥ 32 chars; signs stream cookies. `openssl rand -hex 32`. Changing it signs everyone out. |
| `ALLOWED_STREAM_CODES` | no | Comma-separated private codes, max 5. Default `000,001,002,003,004`. |
| `ANTHROPIC_API_KEY` | one of three | Auto-detected first. Default model `claude-opus-5-5` (override with `ANTHROPIC_MODEL`). |
| `OPENAI_API_KEY` | one of three | Used when no Anthropic key. `OPENAI_MODEL` (default `gpt-5`). |
| `GEMINI_API_KEY` | one of three | Used when neither of the above. `GEMINI_MODEL` (default `gemini-3.5-flash`, works on the free tier; Pro models need billing). |
| `CRON_SECRET` | yes on Vercel | ≥ 16 chars. Vercel Cron sends it as `Authorization: Bearer …`. |
| `ENABLE_INTERNAL_CRON` | no | Self-hosting only: in-process daily ingestion at 05:30. Ignored on Vercel. |

Without an LLM key the app still runs: ingestion, readability profiling, the dashboard, SRS reviews and the
objective parts of the placement audit work; grading, lesson synthesis and the explainer return a clear
`LLM_NOT_CONFIGURED` message.

## Deploying to Vercel

1. Create a Postgres database (Neon or Supabase) and copy the pooled and direct URLs.
2. Import the GitHub repo in Vercel with **Root Directory = `lexiforge`** (that folder holds `vercel.json`).
3. Add the environment variables above (Production), then deploy.
4. Push the schema once from your machine: `DATABASE_URL=… DIRECT_URL=… npm run db:push && npm run db:seed`.
5. Vercel Cron calls `GET /api/cron/ingest` daily at 22:00 UTC (05:00 Hanoi). Manual sync stays in the app.

Timeouts: `/api/explain` and `/api/cron/ingest` 60 s; `/api/evaluate`, `/api/diagnostic`,
`/api/lessons/synthesize` 300 s (thorough grading measured 40–64 s on Gemini Flash; needs Fluid Compute).

## Manual ingestion

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR-APP/api/cron/ingest
```

## Verification

```bash
npm run typecheck
npm run lint
npm test            # metrics, isolation, pipelines — uses the lexiforge_test Postgres DB (TEST_DATABASE_URL) and a scripted LLM double
npm run test:live   # live RSS + Readability against the real feeds (needs network access)
npm run build
```

## Pages

- `/access` — enter a private stream code (the only public page)
- `/onboarding` — distraction-free 3-step calibration audit → Diagnostic Dossier
- `/` **Today** — accountability gate, telemetry + promotion-lock checklist, i+1-matched live briefings
- `/lesson/[id]` (**Workspace**, `/workspace` resumes the active one) — stepper, 62/38 reading + 4-mode inspector,
  audio/shadowing pill, comprehension, production with the Error-Repair Gate, exit ticket and Arsenal receipt
- `/graveyard` — Active SRS queue, recurring error patterns with 3-sentence repair drills, Error Detox
- `/metrics` — radar with next-band ring, 30-day trajectory, errors/100 words, heatmap, evidence ledger
- `/promotion` — zero-hint Band Promotion Audit (only when unlocked) · `/settings` — configuration status

Keyboard: `Space` play/pause audio · `1–4` explainer modes · `⌘/Ctrl+Enter` submit · `Esc` close · `?` legend.
