# Přežijeme? · planetcheck

A 90-second global game: seven allegorical dilemmas, swipe to answer, see instantly what the rest of the planet said,
get a verdict (archetype, survival index, your contradictions) and a share card. The output is a live, weighted,
publicly auditable picture of what the planet thinks — faster than a poll, more open, and funnier.

`ARCHITECTURE.md` is the source of truth. `CLAUDE.md` holds the working rules.

## Quick start (zero setup)

```bash
pnpm install
pnpm dev            # http://localhost:3000 → redirects to /en or /cs
```

The first request boots an **embedded Postgres (PGlite)** in `.pglite/dev`, applies `db/migrations`, syncs
`content/*.yaml`, seeds ~600 synthetic votes and recomputes the stats. No Docker, no accounts.

```bash
pnpm db:local       # full local reset: migrate → content → 10 000 synthetic votes → recompute
pnpm test           # Vitest: scoring, weighting, content, trust + SQL API against PGlite
pnpm test:e2e       # Playwright: plays a round on a 390×844 viewport, checks the 409 on replay
pnpm lint && pnpm typecheck
```

## Production (Railway)

Services: **Next.js** (this repo, `Dockerfile` + `railway.json`), **Postgres**, optionally **Redis**.
Cloudflare proxies the domain (gives `cf-ipcountry` and Turnstile).

1. Create a Railway project, add Postgres (and Redis if you want a shared flood limiter).
2. Deploy this repo (`railway up`, or connect the GitHub repo for deploy-on-push).
3. Set the variables from `.env.example` (`DATABASE_URL` is injected by Railway; use the private URL).
4. Migrations and `content/*.yaml` are applied automatically at server start, under a Postgres
   advisory lock, so several replicas booting at once is safe. Railway does **not** apply
   `railway.json`'s `preDeployCommand` to source uploads, which is why the app does this itself.
   To run either by hand: `railway ssh -- pnpm db:migrate` / `railway ssh -- pnpm content:sync`.
5. Scheduling: the app runs an internal scheduler (recompute every 10 min, narrator daily 06:00 UTC) guarded by a
   DB lease, so multiple replicas are safe. Set `PLANETCHECK_INTERNAL_CRON=false` and call `/api/cron/*` with
   `Authorization: Bearer $CRON_SECRET` from Railway cron if you prefer external scheduling.

## Content workflow

Questions, contradiction pairs, archetypes, country titles and weighting parameters live in `content/` (YAML, zod-validated).
`pnpm content:check` validates, `pnpm content:sync` upserts (never deletes; deactivates). Weekly rounds pull anchor
questions by key from `content/rounds/anchor.yaml`, so anchors keep a long-term trend across rounds.

`pnpm translate -- --to de,pl` fills missing locales with Claude (Haiku) and marks them `machine: true`;
questions with `review_required: true` are not shown in a machine-translated locale until a human sets `reviewed: true`.

## Where things are

| Path | What |
|---|---|
| `db/migrations/` | append-only SQL; `0003_api_functions.sql` is the whole data API (`fn(p jsonb) returns jsonb`) |
| `src/lib/scoring/`, `src/lib/weighting/` | pure functions, unit-tested with concrete numbers |
| `src/lib/db/` | executors (`pg` for Railway, PGlite locally), migration runner, typed `Repo` |
| `src/app/api/` | routes: `rounds/current`, `vote`, `results/*`, `live/planet` (SSE), `og/[id]`, `cron/*`, `export/*`, `auth/*` |
| `src/components/viz/` | pure visualisations (props in, SVG out) — gallery at `/{locale}/dev/viz` |
| `content/`, `data/` | game content, countries (World Bank + world-countries), TopoJSON |
| `messages/` | UI strings (next-intl), cs · sk · en |

## Privacy, in one paragraph

No IP address is stored (only `sha256(IP_SALT + ip)`), no User-Agent (only a coarse browser family), no names, e-mails
or photos — the verified layer keeps a salted hash of the OAuth subject id and nothing else. Demographics are optional
and coarse. Suspicious votes are flagged, never blocked; the only hard block is one vote per person per round.
Exports contain aggregates only, with small countries folded into `--`.
