# LexiForge

English acquisition from **today's real news**, with **deterministic, unit-tested proficiency tracking**.
No XP, no streaks, no self-reported level, no passive completion. The engineering contract (formulas,
invariants, test commands) is in [`CLAUDE.md`](./CLAUDE.md).

## Requirements

- Node.js **22.22+** (or 24.15+) — required by `jsdom`
- One LLM API key: Anthropic, OpenAI or Google Gemini
- Outbound HTTPS to the news feeds (BBC, The Guardian, NPR, Aeon, TechCrunch, The Verge, Quanta)

## Setup

```bash
cd lexiforge
npm install
cp .env.example .env        # then edit .env (see below)
npx prisma db push          # creates prisma/lexiforge.db (SQLite)
npm run db:seed             # seeds the 9 default RSS feeds
npm run dev                 # http://localhost:3000
```

On first launch you are sent to the **placement audit** (reading → error detection → writing).
After it, press **Sync Live Content Now** on the dashboard to pull today's articles.

## `.env`

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | yes | `file:./lexiforge.db` (relative to `prisma/`). For PostgreSQL change `provider` in `schema.prisma` and use a `postgresql://` URL. |
| `ANTHROPIC_API_KEY` | one of three | Auto-detected first. Default model `claude-opus-5-5` (override with `ANTHROPIC_MODEL`). |
| `OPENAI_API_KEY` | one of three | Used when no Anthropic key. `OPENAI_MODEL` (default `gpt-5`). |
| `GEMINI_API_KEY` | one of three | Used when neither of the above. `GEMINI_MODEL` (default `gemini-2.5-pro`). |
| `CRON_SECRET` | for `/api/cron/ingest` | ≥ 16 chars. Generate with `openssl rand -hex 32`. Without it the cron endpoint returns 503. |
| `ENABLE_INTERNAL_CRON` | no | `true` schedules ingestion in-process every day at 05:30 server time (`node-cron`). |

Without an LLM key the app still runs: ingestion, readability profiling, the dashboard, SRS reviews and the
objective parts of the placement audit work; grading, lesson synthesis and the explainer return a clear
`LLM_NOT_CONFIGURED` message.

With the Anthropic provider, requests use adaptive thinking and the server-side refusal fallback
(`fallbacks: "default"`) for models that support it.

## Scheduling ingestion externally

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ingest
```

Concurrent triggers (cron + manual button) share one run. Dead feeds are recorded and skipped; after three
consecutive failures a feed is marked `FAILING` on the dashboard.

## Verification

```bash
npm run typecheck
npm run lint
npm test            # offline: metrics, schemas, pipelines (uses prisma/test.db and a scripted LLM double)
npm run test:live   # live RSS + Readability against the real feeds (needs network access)
npm run build
```

## Pages

- `/onboarding` — distraction-free 3-step calibration audit → Diagnostic Dossier
- `/` **Today** — accountability gate, telemetry + promotion-lock checklist, i+1-matched live briefings
- `/lesson/[id]` (**Workspace**, `/workspace` resumes the active one) — stepper, 62/38 reading + 4-mode inspector,
  audio/shadowing pill, comprehension, production with the Error-Repair Gate, exit ticket and Arsenal receipt
- `/graveyard` — Active SRS queue, recurring error patterns with 3-sentence repair drills, Error Detox
- `/metrics` — radar with next-band ring, 30-day trajectory, errors/100 words, heatmap, evidence ledger
- `/promotion` — zero-hint Band Promotion Audit (only when unlocked) · `/settings` — configuration status

Keyboard: `Space` play/pause audio · `1–4` explainer modes · `⌘/Ctrl+Enter` submit · `Esc` close · `?` legend.
