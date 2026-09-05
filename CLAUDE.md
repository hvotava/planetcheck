# CLAUDE.md — planetcheck („Přežijeme?")

Globální 90vteřinová hra s geopolitickými dilematy. Výstup: živý, vážený obraz názorů planety. Před jakoukoli prací si přečti `ARCHITECTURE.md` — je to zdroj pravdy. Když narazíš na rozpor mezi kódem a dokumentem, platí dokument; když je dokument špatně, nejdřív navrhni změnu dokumentu.

## Stack (neměnit bez diskuse)
Next.js 15 App Router · TypeScript strict · Tailwind · next-intl · Railway (Postgres přes `pg`, Redis, hosting) · PGlite pro lokální vývoj a testy · SSE pro realtime · Cloudflare Turnstile · D3 + Framer Motion + Recharts · next/og (satori) · Vitest · Playwright · pnpm.
(Změna 2026-09-04: místo Supabase pojede Railway — detaily v `ARCHITECTURE.md` §3.)

## Příkazy
```
pnpm dev                 # Next dev server
pnpm build && pnpm start
pnpm test                # Vitest unit
pnpm test:e2e            # Playwright (potřebuje běžící dev + seed)
pnpm lint && pnpm typecheck
pnpm db:migrate          # aplikuje db/migrations (na Railway jako pre-deploy command)
pnpm db:reset            # reset lokální DB (PGlite nebo localhost Postgres) + migrace + content
pnpm db:local            # reset + content + 10k syntetických hlasů + recompute
pnpm db:types            # generuje src/types/database.ts ze schématu
pnpm content:sync        # content/*.yaml → DB
pnpm seed                # scripts/seed-synthetic.ts (10k hlasů, 40 zemí)
pnpm recompute           # scripts/recompute.ts (váhy, country_stats) lokálně
pnpm translate -- --to sk,de,pl
```

## Pevná pravidla
1. **Klient nikdy nepíše do DB.** Všechny zápisy přes `src/app/api/*` a SQL funkce (`db/migrations/0003_api_functions.sql`). App kód importuje DB jen z `src/lib/db/server.ts` (`import "server-only"`).
2. **Nikdy neukládej surovou IP, User-Agent ani nic osobního.** Jen `ip_hash` (sha256 se `IP_SALT`). Demografie pouze `age_band`, `gender`, `settlement`.
3. **`src/lib/scoring/*` a `src/lib/weighting/*` jsou čisté funkce** bez I/O, každá má unit test. Změna koeficientů = změna v `content/`, ne v kódu.
4. **Podezřelý hlas se flaguje, neblokuje.** Jediný tvrdý blok je unique `(round_id, voter_id)` → 409.
5. **Každé číslo ve UI má variantu raw a weighted.** Neukazuj jen jedno.
6. **Všechny texty přes next-intl** (`messages/*.json`). Žádný hardcoded string v komponentách, ani v češtině.
7. **Viz komponenty jsou pure:** dostanou data props, nevolají síť. Realtime a fetch řeší rodičovské page/hooky. Každá má ukázku na `/dev/viz`.
8. **Obsah otázek jen z `content/*.yaml`** validovaný zodem. Otázky zmiňující konkrétní stát mají `review_required: true`.
9. **Cron endpointy** kontrolují `Authorization: Bearer ${CRON_SECRET}` jako první řádek.
10. **Narátor se nikdy nepublikuje bez `approved = true`.**

## Konvence
- Soubory `kebab-case.ts`, komponenty `PascalCase.tsx`, jedna komponenta na soubor.
- Server komponenty default; `"use client"` jen kde je interakce (SwipeDeck, viz s animací).
- API routes vrací `{ ok: true, data }` nebo `{ ok: false, error: { code, message } }`; HTTP status odpovídá.
- DB typy generovat `pnpm db:types` do `src/types/database.ts`, nepsat ručně.
- Migrace jsou append-only, číslované `NNNN_popis.sql`. Nikdy neupravuj existující migraci.
- Commit zprávy: `feat(vote): …`, `fix(viz): …`, `content: …`, `docs: …`.
- Komentáře a identifikátory v kódu anglicky; UI texty v `messages/`.

## Definition of done (pro každý task)
- `pnpm lint && pnpm typecheck && pnpm test` zelené.
- Pokud se změnil scoring/weighting: nový nebo upravený unit test s konkrétními čísly.
- Pokud se změnil vote flow: e2e test projde na viewportu 390×844.
- Pokud se změnil datový model: nová migrace + regenerované typy + aktualizovaná sekce 5 v `ARCHITECTURE.md`.

## Pořadí práce
Fáze 0 → 1 → 2 → 3 → 4 → 5 podle `ARCHITECTURE.md` §15. Nezačínej další fázi bez splnění „Hotovo, když". V každé fázi nejdřív typy a testy, pak implementace, pak UI.

## Co dělat, když si nejsi jistý
Zeptej se. Neodhaduj koeficienty, prahy, formulace otázek ani politicky citlivé texty — ty vždy potvrdit s Hynkem.
