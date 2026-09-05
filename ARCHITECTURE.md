# Přežijeme? — architektura

Kódové jméno projektu: `planetcheck`. Globální 90vteřinová hra: 7 dilemat, swipe, okamžitá zpětná vazba „co říká planeta", na konci verdikt + archetyp + sdílecí kartička. Výstupem je živý, vážený, veřejně auditovatelný obraz názorů populace planety — rychlejší než Pew/Gallup, otevřenější a vtipnější.

Tento dokument je jediný zdroj pravdy pro Claude Code. Když se rozhodnutí tady liší od něčeho v kódu, platí dokument; když je potřeba změna, změň nejdřív dokument.

---

## 1. Cíle a ne-cíle

**Cíle (MVP)**
- Hra projde na mobilu bez registrace do 90 s, každá odpověď hned ukáže planetární rozložení.
- Jeden hlas na osobu a kolo (ne navždy), dvě vrstvy důvěry: anonymní a ověřený.
- Živá výsledková obrazovka: EKG planety, dva tábory, mapa, rozporoměr, žebříček zemí.
- Vážená i surová data, veřejná metodika, export.
- Sdílecí OG kartička generovaná na serveru.
- Vícejazyčnost od začátku (cs, sk, en; zbytek přes překladový skript).

**Ne-cíle (MVP)**
- Žádné uživatelské profily, feed, komentáře, chat.
- Žádný nativní mobil — PWA stačí.
- Žádná vlastní infrastruktura; vše managed (Railway, Cloudflare).
- Proroctví (forecasting) a školní mód až ve fázi 5.

---

## 2. Doménový slovník

| Pojem | Význam |
|---|---|
| **Round** (kolo) | Sada otázek s časovým oknem. Druhy: `anchor` (stálé kotvy, dlouhodobý trend), `weekly` (týdenní téma), `flash` (blesková otázka při události). Jeden hlas na voter+round. |
| **Question** | Dilema se scénářem a 2–4 možnostmi (`choice`), nebo meta otázka `meta` („kolik % lidí zvolilo X?"). |
| **Option** | Možnost odpovědi. Nese váhy na osách (`axis_weights`), příznak `compromise`, příznak `honeypot`. |
| **Axis** (osa) | `peace_force`, `trust_paranoia`, `us_them`. Hodnoty −1..+1. Čtvrtá „osa" `realism` se počítá z meta otázek. |
| **Voter** | Zařízení/identita. Anonymní cookie UUID + serverový otisk. Může být povýšen na `verified`. |
| **Submission** | Jedno kompletní odehrání kola jedním voterem. Nese skóre, archetyp, váhu, zemi, trust. |
| **Archetype** | Diplomat, Jestřáb, Holubice, Strejda od piva, Švýcar (+ rozšiřitelné). Přiřazuje se pravidly nad osami. |
| **Survival score** | 0–1 na osobu: konzistence + ochota ke kompromisu + realismus. Průměr přes vážené submissions = Index přežití planety / země. |
| **Contradiction pair** | Dvojice otázek definovaná v obsahu jako logicky napjatá (chce mír + chce jaderné zbraně). Základ rozporoměru. |
| **Weight** | Post-stratifikační váha submission (populace země × demografie). Přepočítává se cronem. |

---

## 3. Stack (rozhodnuto, neotvírat)

> **Změna 2026-09-04 (Hynek):** místo Supabase pojede Railway. Tato sekce je podle toho přepsaná; původní volby jsou v historii dokumentu.

| Vrstva | Volba | Proč |
|---|---|---|
| Frontend + API | **Next.js 15 (App Router), TypeScript, Tailwind v4** | Claude Code s ním pracuje nejspolehlivěji, jeden repozitář pro UI i API. |
| Hosting | **Railway** (Next.js jako služba, `Dockerfile` + `railway.json`) + **Cloudflare** proxy před ním | Jeden účet pro app, DB i Redis. Cloudflare dává `cf-ipcountry`, Turnstile a WAF zdarma v jednom. |
| DB | **Railway Postgres** přes `pg`; datová vrstva = SQL funkce `fn(p jsonb) returns jsonb` (`db/migrations/0003_api_functions.sql`) | Jedna round-trip na operaci, transakce v DB, žádný ORM. Aplikace nikdy nepíše do tabulek přímo. |
| Lokální vývoj / testy | **PGlite** (embedded Postgres, WASM) se stejnými migracemi | `pnpm dev` a `pnpm test` bez Dockeru; testy SQL API běží proti skutečnému Postgresu. |
| Realtime | **SSE** z Next.js (`/api/live/planet`, jeden poller na kolo a proces) + polling fallback | Railway drží dlouhoběžící proces; žádný socket server ani replication publication. |
| Plánované úlohy | **Interní scheduler** v `instrumentation.ts` (recompute 10 min, narátor 06:00 UTC) s DB leasem `job_leases`; volitelně Railway cron → `/api/cron/*` s `CRON_SECRET` | Bez pg_cron; více replik je bezpečných díky leasu. |
| Rate limit | **Railway Redis** (`ioredis`, `REDIS_URL`) nebo in-memory fallback | Jen flood guard (429 při >30 req/min na otisk IP). Limity 10/h a 3/h z §6 jsou flagy počítané v SQL. |
| Boti | **Cloudflare Turnstile** | Neviditelné, bez CAPTCHA UX. |
| Ověřená vrstva | **OAuth (Google/Apple) přes `arctic`**, ukládá se jen `sha256(AUTH_SECRET+provider+subject)` | Bez Supabase Auth; nic osobního v DB. |
| Vizualizace | **D3** (mapa, TopoJSON world-110m), **Framer Motion** (EKG, karty), **Recharts** (trend, archetypy) | D3 jen tam, kde je nutné; zbytek deklarativně. |
| OG obrázky | **`next/og` (satori + resvg-wasm)** přes API route | Server-side PNG, bez headless browseru. |
| i18n | **next-intl** | Locale v URL (`/cs/play`), zprávy v `messages/*.json`. |
| Obsah (CMS) | **YAML v repu** (`content/`) + `pnpm content:sync` do DB | Verzované, reviewovatelné, bez adminu. |
| LLM | **Claude API** (`@anthropic-ai/sdk`) — narátor: `claude-sonnet-5`; překlady: `claude-haiku-4-5-20251001` | Docs: https://docs.claude.com/en/api/overview — ověř aktuální názvy modelů před použitím. |
| Testy | **Vitest** (unit: scoring, weighting, trust, content; DB: SQL API na PGlite), **Playwright** (e2e: celý průchod hrou) | |
| Balíčky | **pnpm** | |

## 4. Struktura repozitáře

```
planetcheck/
├── CLAUDE.md                     # pravidla pro Claude Code
├── ARCHITECTURE.md               # tento dokument
├── package.json
├── next.config.ts
├── railway.json / Dockerfile
├── .env.example
├── content/                      # obsah hry, verzovaný
│   ├── rounds/
│   │   ├── anchor.yaml           # stálé kotvy
│   │   └── 2026-w37.yaml         # týdenní kolo
│   ├── archetypes.yaml           # pravidla přiřazení archetypů
│   ├── contradictions.yaml       # dvojice otázek pro rozporoměr
│   └── titles.yaml               # vtipné tituly zemí + podmínky
├── data/
│   ├── countries.json            # ISO2, názvy, populace (UN), region
│   └── world-110m.json           # TopoJSON
├── messages/                     # next-intl
│   ├── cs.json
│   ├── sk.json
│   └── en.json
├── public/
├── scripts/
│   ├── migrate.ts                # aplikuje db/migrations (Railway pre-deploy; --reset jen lokálně)
│   ├── db-types.ts               # generuje src/types/database.ts ze schématu (PGlite)
│   ├── build-countries.ts        # World Bank + world-countries → data/countries.json
│   ├── sync-content.ts           # YAML → DB (idempotentní upsert, nikdy nemaže)
│   ├── seed-synthetic.ts         # syntetické hlasy pro vývoj (N zemí, rozložení)
│   ├── translate.ts              # messages + content → další jazyky přes Claude
│   └── recompute.ts              # lokální spuštění vážení/statistik
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── (site)/page.tsx           # landing: EKG + CTA „Hraj"
│   │   │   ├── (site)/play/page.tsx      # herní smyčka
│   │   │   ├── (site)/result/[submissionId]/page.tsx
│   │   │   ├── (site)/planet/page.tsx    # živé výsledky
│   │   │   ├── (site)/country/[code]/page.tsx
│   │   │   ├── (site)/methodology/page.tsx
│   │   │   ├── (site)/data/page.tsx      # exporty CSV/JSON
│   │   │   ├── (site)/verify/page.tsx    # ověřená vrstva (OAuth)
│   │   │   ├── (site)/dev/viz/page.tsx   # galerie viz komponent
│   │   │   └── embed/planet/page.tsx     # iframe widget (bez headeru)
│   │   └── api/
│   │       ├── rounds/current/route.ts
│   │       ├── vote/route.ts
│   │       ├── results/planet/route.ts
│   │       ├── results/country/[code]/route.ts
│   │       ├── results/question/[id]/route.ts
│   │       ├── results/board, results/pulse
│   │       ├── live/planet/route.ts      # SSE (náhrada Supabase Realtime)
│   │       ├── og/[submissionId]/route.tsx
│   │       ├── auth/[provider]/{start,callback}, auth/logout
│   │       ├── admin/narrator/route.ts   # schvalování narátora (ADMIN_TOKEN)
│   │       ├── export/[round]/route.ts
│   │       ├── health/route.ts
│   │       └── cron/
│   │           ├── recompute/route.ts    # váhy, country_stats, planet_stats
│   │           └── narrator/route.ts     # denní komentář
│   ├── components/
│   │   ├── game/       # QuestionCard, SwipeDeck, MetaSlider, DemographicsStep, Verdict
│   │   ├── viz/        # Ekg, TwoCamps, WorldMap, ContradictionMeter, CountryBoard, RulerSwitch, ShareCard
│   │   └── ui/
│   ├── instrumentation.ts / instrumentation-node.ts   # interní scheduler
│   ├── lib/
│   │   ├── db/         # executor (pg | pglite), migrate runner, typed Repo nad SQL API
│   │   ├── scoring/    # axes.ts, archetype.ts, survival.ts, contradiction.ts (čisté funkce)
│   │   ├── weighting/  # raking.ts (čisté funkce)
│   │   ├── trust/      # fingerprint.ts, turnstile.ts, ratelimit.ts
│   │   ├── content/    # loader + validace YAML (zod)
│   │   ├── i18n/
│   │   ├── recompute/  # orchestrace přepočtu + čistý builder country_stats
│   │   ├── seed/       # generátor syntetických hlasů
│   │   ├── jobs/, narrator/, auth/, api/
│   │   └── og/fonts/
│   └── types/
├── db/
│   └── migrations/
│       ├── 0001_init.sql             # schéma (plain Postgres)
│       ├── 0002_schema_additions.sql # synthetic flag, snapshots, job_leases, auth_sessions
│       └── 0003_api_functions.sql    # SQL API
└── tests/
    ├── unit/
    └── e2e/
```

Pravidlo: vše v `src/lib/scoring` a `src/lib/weighting` jsou čisté funkce bez I/O — dostanou data, vrátí čísla. Pouze ty mají povinné unit testy.

---

## 5. Datový model

Plné SQL je v `db/migrations/`. Přehled:

```
rounds ─┬─< questions ─< options
        │
        ├─< submissions ─< answers            (choice odpovědi)
        │        │      └< meta_guesses       (meta odpovědi)
        │        └── voters
        ├─< agg_option_country                (trigger-inkrementované počty)
        ├─< country_stats                     (cron)
        ├─< planet_stats                      (cron, 1 řádek na kolo)
        ├─< pulse_buckets                     (hlasy za minutu, EKG)
        ├─< planet_snapshots                  (řada planet_stats při každém přepočtu; trend, „pohyb za 24 h")
        └─< narrator_posts

prophecies ─< prophecy_guesses                (proroctví; guess je vázán na voters, ne na kolo)
class_codes ─< submissions.class_code         (školní mód; třída je štítek u hlasu, ne náhrada země)
auth_users ─< voters ─< auth_sessions         (jen hash OAuth subjectu; žádný e-mail ani jméno)
job_leases                                    (leader election pro interní scheduler)
country_population                            (statická, World Bank + world-countries)
```

Klíčová rozhodnutí:
- **Texty otázek/možností** jsou v `i18n jsonb` sloupci (`{"cs": {...}, "en": {...}}`), ID možností jsou stabilní přes jazyky, agregace jazyk neřeší.
- **`agg_option_country`** je inkrementováno triggerem při vložení `answers` (dimenze: round, question, option, country, trust_level). Slouží pro živé grafy. Demografické filtry („kdyby vládli jen…") jdou dotazem nad `answers ⋈ submissions` s 60s cache, nikdy z trigger-tabulky.
- **`pulse_buckets`** má řádek na minutu; trigger dělá `upsert +1`. Řešení kontence místo jednoho horkého řádku.
- **Žádná surová IP nikde.** Ukládá se jen `ip_hash = sha256(IP_SALT + ip)`; `IP_SALT` je tajný a rotuje se jednou za kvartál (ne za den — rozbilo by dedupe uvnitř kola).
- **Demografie** jsou volitelné a hrubé: `age_band` (18-24, 25-34, 35-44, 45-54, 55-64, 65+), `gender` (f, m, x), `settlement` (city, town, rural). Nic víc se nesbírá, nikdy.
- **Datový přístup výhradně přes SQL funkce** `fn(p jsonb) returns jsonb` (0003). Aplikace volá `select fn($1::jsonb)`; stejný kód běží na Railway Postgresu (`pg`) i v PGlite (dev/testy). Typy tabulek generuje `pnpm db:types`.
- `submissions.synthetic` označuje seedované hlasy (jen lokálně/staging), `contradictions_hit` drží klíče aktivovaných dvojic, `ua_family` hrubou rodinu prohlížeče.
- **`class_codes` + `submissions.class_code`** (migrace `0005`): školní mód. Kód je 6 znaků z abecedy bez záměnných písmen (bez I, L, O, 0, 1 — čte se nahlas ve třídě) a je zároveň jediný klíč: nezakládá se účet, neukládá se jméno ani e-mail. Hlas s kódem **normálně počítá pro planetu i pro svou zemi** — studenti jsou skuteční lidé, třída je jen další pohled. Dvě věci z toho plynou: (a) třída sdílí školní síť, takže při platném kódu se pro `rate_ip` použije `rate_ip_per_hour_class` z `content/weighting.yaml` — jinak by se většina třídy oflagovala a zmizela z veřejných čísel, což je přesně ten ban sdílených sítí, který §6 zakazuje; (b) stránka třídy neukáže **nic** pod `min_class_submissions` hlasy a nikdy neukazuje demografii. Třída se **neváží** (`weighted = null`): post-stratifikace přepočítává vzorek na populaci a třída není vzorek ničeho. `submit_vote` je kvůli sloupci `create or replace`-nuté v `0005`, jak předepisuje hlavička `0003`.
- **`prophecies` / `prophecy_guesses`** (migrace `0004`): proroctví je tvrzení o budoucnosti s oknem `opens_at … closes_at` a datem `resolves_at`. Není vázané na kolo — přežívá je. Jeden tip na votera a proroctví (unique), opakování = 409, nikdy tichá výměna. `outcome` nastavuje **jen** operátor přes `resolve_prophecy` (`POST /api/admin/prophecy` s `ADMIN_TOKEN`), nikdy obsah ani job; `resolution_note` je veřejný a povinný. Při rozhodnutí dostane každý tip `brier = (p − outcome)²`. Vážení používá jen zemskou část §9 (populace / vzorek, clamp z `content/weighting.yaml`) — tipy nenesou demografii, takže se neraky. Guess ukládá `ip_hash`, nikdy IP.

---

## 6. Tok hlasu (kritická cesta)

```
klient                         /api/vote                         Postgres
  │                                │                                │
  │ 1. GET /api/rounds/current      │                                │
  │ ◄── otázky (locale) + turnstile │                                │
  │                                │                                │
  │ 2. hraje lokálně, po každé     │                                │
  │    odpovědi GET /results/question/:id (cache 15 s) ─────────────►│
  │                                │                                │
  │ 3. POST {roundId, anonId,      │                                │
  │    answers[], metaGuesses[],   │ 4. Turnstile verify (CF)       │
  │    demographics?, token}  ────►│ 5. rate limit (Upstash):        │
  │                                │    ip_hash 10/h, anonId 3/h    │
  │                                │ 6. country = cf-ipcountry       │
  │                                │ 7. voter upsert (anonId)        │
  │                                │ 8. validace: všechny otázky     │
  │                                │    kola, honeypot, doba < 8 s   │
  │                                │    od načtení = flag            │
  │                                │ 9. scoring (čisté funkce)       │
  │                                │ 10. INSERT submission+answers   │
  │                                │     v transakci; unique         │
  │                                │     (round_id, voter_id)  ─────►│ triggery: agg + pulse
  │ ◄── {submissionId, result}     │                                │
  │ 11. redirect /result/:id        │                                │
```

Pravidla:
- Duplicitní hlas (unique violation) → 409 s odkazem na původní výsledek, nikdy tichá výměna.
- Podezřelé hlasy se **neblokují, flagují** (`flagged = true`, `flag_reasons text[]`). Do veřejných čísel jdou jen `flagged = false`. Sdílené sítě (školy, firmy) nesmí dostat ban.
- Honeypot: každé kolo má 1 otázku s možností označenou `honeypot: true`. Je to **záměrně nudná kontrolní možnost** („Nevybírat – kontrolní možnost"), ne vtip — vtipná možnost láká přesně hravé hráče, které chceme udržet. Volba honeypotu = flag, ne blok.
- Časový limit: submission odeslaná < 8 s po načtení kola = flag `too_fast`.
- Turnstile token se ověřuje vždy; při výpadku CF hlas přijmi a flaguj `turnstile_unavailable`.
- **`anonId` se nikdy nebere z těla requestu** — identita je httpOnly cookie `pc_anon`, kterou nastavuje server (`GET /api/rounds/current`, `POST /api/vote`). Klient ji nemůže číst ani podvrhnout.
- Limity 10/h na `ip_hash` a 3/h na voter se počítají uvnitř `submit_vote` a jsou to **flagy** (`rate_ip`, `rate_anon`). Jediné 429 je flood guard (>30 req/min na otisk IP) v `src/lib/trust/ratelimit.ts` — anti-DoS, ne hlasovací politika.

---

## 7. Identita a vrstvy důvěry

| Vrstva | Jak vzniká | Co znamená |
|---|---|---|
| `anon` | httpOnly cookie `pc_anon` (UUID, 1 rok) + `ip_hash` + `ua_family` | Výchozí. Počítá se, ale je označen. |
| `verified` | OAuth Google / Apple přes `arctic` (`/api/auth/[provider]/start` → `/callback`). Z id tokenu se čte jen `sub`, uloží se `sha256(AUTH_SECRET+provider+sub)` do `auth_users`. `link_auth_user` propojí voter ↔ identitu, zpětně přepne submissions na `verified`, při kolizi (round, identita) starší hlas zůstane a novější dostane flag `duplicate_identity`. | To, co se cituje jako „ověřená vrstva". |

Dedupe je na `(round_id, voter_id)`. Voter s `auth_user_id` má navíc unique na `(round_id, auth_user_id)` — smazání cookie nepomůže. Přihlášení z nového zařízení přesune identitu na novou cookie; staré hlasy zůstávají ověřené.

Země: primárně `cf-ipcountry`; hráč může v Demographics kroku deklarovat jinou (`declared_country`). Když se liší, submission dostane `country_mismatch` flag; do statistik jde `declared_country`, do auditu obojí. VPN se řeší statisticky, ne technicky.

---

## 8. Scoring

Vše v `src/lib/scoring/`, čisté funkce, vstup = odpovědi + obsah kola, výstup = `SubmissionScore`.

```ts
type AxisKey = "peace_force" | "trust_paranoia" | "us_them";
type SubmissionScore = {
  axes: Record<AxisKey, number>;   // −1..+1
  realism: number;                 // 0..1
  consistency: number;             // 0..1
  compromise: number;              // 0..1
  survival: number;                // 0..1
  archetype: string;               // key z archetypes.yaml
};
```

- **Osy**: součet `axis_weights` zvolených možností / maximální možný absolutní součet v kole → −1..+1.
- **Realism**: pro každou meta otázku `1 − |guess − actual| / 100`, průměr. `actual` = aktuální vážený podíl v čase odeslání (uloží se do `meta_guesses.actual_at_submit`); cron přepočítá po uzavření kola na finální hodnotu.
- **Consistency**: `1 − (počet aktivovaných contradiction pairs / počet párů v kole)`. Pár je aktivován, když hráč zvolil obě „napjaté" možnosti definované v `contradictions.yaml`.
- **Compromise**: podíl zvolených možností s `compromise: true`.
- **Survival** = `0.40·consistency + 0.35·compromise + 0.25·realism`. Koeficienty jsou v `content/rounds/*.yaml` per kolo, ne v kódu.
- **Archetyp**: pravidla v `archetypes.yaml` se vyhodnocují shora dolů, první shoda vyhrává, poslední pravidlo je fallback.

```yaml
# content/archetypes.yaml (ukázka)
- key: svycar
  when: { abs_all_axes_below: 0.2 }
- key: holubice
  when: { peace_force: { lt: -0.4 }, trust_paranoia: { gt: 0 } }
- key: jestrab
  when: { peace_force: { gt: 0.4 } }
- key: strejda
  when: { realism: { lt: 0.4 }, us_them: { gt: 0.3 } }
- key: diplomat
  when: { compromise: { gt: 0.5 } }
- key: strejda      # fallback
  when: {}
```

Index přežití planety / země = vážený průměr `survival` × 100 přes neflagované submissions.

---

## 9. Vážení (post-stratifikace)

`src/lib/weighting/raking.ts` (čistá funkce nad buňkami země × věk × pohlaví, O(buněk)), spouští interní scheduler / `/api/cron/recompute` každých 10 minut, zapisuje `submissions.weight` přes `apply_cell_weights`. Parametry jsou v `content/weighting.yaml` — ten samý soubor čte `/methodology`.

1. **Váha země** = `(populace_země / populace_světa) / (submissions_země / submissions_celkem)`, ořez `[0.2, 5.0]`. Země s < 30 submissions dostanou váhu 1 a ve výsledcích jsou označeny `insufficient_sample`.
2. **Uvnitř země**, pokud má ≥ 200 submissions s vyplněnou demografií: raking na `age_band × gender` proti cílovým podílům z `data/countries.json` (World Bank, 5leté skupiny × pohlaví agregované na pásma dospělých). Max 10 iterací, tolerance 0.01. Faktory se ořezávají na `cell_clamp` [0.2, 5.0] a re-centrují na průměr 1 (doplněno kvůli malým buňkám — potvrdit s Hynkem). Bez demografie → jen krok 1.
3. Výsledná váha = součin, normalizovaná tak, aby součet vah = počet submissions.

Vždy se ukazují **obě čísla**: `raw` a `weighted`. Stránka `/methodology` musí být generovaná z těch samých konstant (ořezy, prahy), ne psaná ručně — jinak se rozjede.

---

## 10. Realtime a výsledky

- **EKG**: klient odebírá SSE `/api/live/planet` (jeden DB poller na kolo a proces, tick každých 5 s: `planet_stats` obnovené přes `refresh_planet_pulse` nejvýš každých 10 s + řada `pulse_buckets` za 60 min); fallback je polling `/api/results/pulse`. Křivka = hlasy za minutu; při `flash` kole se přidá pípnutí.
- **Dva tábory / mapa / rozporoměr**: `GET /api/results/planet?round=&filter=` s `Cache-Control: s-maxage=15`. Filtr = demografie nebo trust; bez filtru čte `agg_option_country`, s filtrem dotaz nad `answers`.
- **Země**: `country_stats` (cron): `survival_index`, `contradiction_index`, `top_archetype`, `titles[]`, `submissions_count`, `unlocked` (≥ prah z `rounds.unlock_threshold`). Než země odemkne, ukazuje se jen progress bar a nejbližší rival.
- **Tituly zemí** (`content/titles.yaml`): podmínky nad `country_stats` (např. `nejparanoidnejsi: max(trust_paranoia)` mezi odemčenými). Vyhodnocuje cron, výsledek uložen, ne počítán za běhu.

---

## 11. Obsah a i18n

- Otázka v YAML:

```yaml
# content/rounds/2026-w37.yaml
round:
  slug: 2026-w37
  kind: weekly
  starts_at: 2026-09-07T06:00:00Z
  ends_at: 2026-09-13T22:00:00Z
  unlock_threshold: 500
  survival_weights: { consistency: 0.4, compromise: 0.35, realism: 0.25 }
questions:
  # meta otázka stojí TĚSNĚ PŘED svou cílovou kartou: hráč tipuje dřív, než kartu a rozložení
  # planety uvidí; odhalení („planeta říká X %, tvůj tip Y %") přijde ve zpětné vazbě cílové karty
  - key: neighbor_field_meta
    type: meta
    target: { question: neighbor_field, option: cousin }
    i18n:
      cs: { scenario: "Další karta: soused ti zabral pole.", text: "Kolik % planety zavolá bratrance s traktorem?" }
      en: { scenario: "Next card: your neighbour took your field.", text: "What % of the planet calls their cousin with the tractor?" }
  - key: neighbor_field
    type: choice
    i18n:
      cs: { text: "Soused ti zabral pole. Co uděláš?" }
      en: { text: "Your neighbour took your field. What now?" }
    options:
      - key: un
        i18n: { cs: { text: "Zavolám OSN" }, en: { text: "Call the UN" } }
        axis_weights: { peace_force: -1, trust_paranoia: 1 }
        compromise: true
      - key: cousin
        i18n: { cs: { text: "Zavolám bratrance s traktorem" }, en: { text: "Call my cousin with the tractor" } }
        axis_weights: { peace_force: 1, us_them: 1 }
      - key: fence
        i18n: { cs: { text: "Postavím plot a dělám, že nic" }, en: { text: "Build a fence, pretend nothing happened" } }
        axis_weights: { peace_force: 0, trust_paranoia: -0.5 }
      - key: control
        honeypot: true   # nudná kontrolní možnost, viz §6
        i18n: { cs: { text: "Nevybírat – kontrolní možnost" }, en: { text: "Do not pick – control option" } }
        axis_weights: {}
```

- **Kotvy**: `content/rounds/anchor.yaml` je zároveň kolo (`kind: anchor`, bez konce — fallback, když neběží týdenní kolo) a knihovna. Týdenní kolo je přebírá přes `include_anchors: [{ key, position }]`; klíč otázky zůstává stejný napříč koly → dlouhodobý trend (`question_trend`). Pozice jsou explicitní, kolize = chyba validace.
- **Rozporné dvojice** jsou knihovna v `content/contradictions.yaml`; sync připojí ke kolu každou dvojici, jejíž obě otázky v kole jsou. Dvojice musí spojovat dvě různé otázky (dvě možnosti téže otázky nejde zvolit obě — taková dvojice by jen nafukovala jmenovatel konzistence).
- **Meta otázka stojí těsně před svou cílovou otázkou** (pozice cíle = pozice meta + 1). Důvod: po každé odpovědi se hned ukazuje rozložení planety; meta až po cíli by měřila paměť, ne realismus. Meta karta nic neodhaluje; odhalení tipu je součástí zpětné vazby cílové karty. Doporučeno jedna meta otázka na kolo.
- **Balíček nemá být monotónní**: ne každá karta má čtyři možnosti (2–4), kompromisní možnost má někdy cenu (odzbrojím první), a kolo má aspoň jedno dilema s existenčními sázkami (nemoc, zbraň), ne jen majetkové spory. Vyřazené otázky se parkují v `content/bench.yaml` (nenačítá se).
- Validace vynucuje: přesně jeden honeypot na živé kolo, meta otázka těsně před svou cílovou otázkou, rozporná dvojice přes dvě různé otázky, 3–9 dilemat, unikátní klíče a pozice.
- `scripts/sync-content.ts`: validace zod → `sync_round(jsonb)` (atomický upsert podle `(round.slug, question.key, option.key)`). Nikdy nemaže; deaktivuje (`active = false`).
- **Nasazení obsahu**: při startu serveru (`instrumentation-node.ts` → `src/lib/db/bootstrap-pg.ts`) se pod poradním zámkem Postgresu (`pg_advisory_lock`) aplikují migrace a spustí `syncContent`. Obojí je idempotentní, takže víc replik současně je bezpečné. Railway `preDeployCommand` z `railway.json` se u nahrávaného zdroje (`railway up`) neaplikuje — bez tohoto bootstrapu by nasazení tiše servírovalo starý obsah.
- `scripts/translate.ts`: pro chybějící locale vygeneruje překlad přes Claude API (Haiku), uloží jako `i18n.<locale>` s příznakem `machine: true`. Komunitní opravy = PR do repa. Politicky citlivé otázky (Rusko/Ukrajina, Čína, Izrael) mají v YAML `review_required: true` — bez lidského schválení (`reviewed: true` u daného locale) se v daném jazyce nezobrazí; hráč dostane anglický text s označením `fallback_locale`, aby kolo zůstalo hratelné a validace „všechny otázky zodpovězeny" platila.

---

## 12. Narátor

`/api/cron/narrator` jednou denně (06:00 UTC): vezme `planet_stats`, top 5 `country_stats`, největší pohyb za 24 h a nejsilnější rozpor → Claude API (Sonnet) s pevným system promptem „generální tajemník planety, suchý humor, žádná strana nesmí vyjít lépe, 120–180 slov" → uloží `narrator_posts` s `approved = false` (+ `context` s čísly pro audit). Zobrazí se až po ručním schválení (`POST /api/admin/narrator { id, approved }` s `Authorization: Bearer ADMIN_TOKEN`; `GET` vypíše drafty). Nikdy autopublikace.

---

## 13. Sdílecí kartička

`GET /api/og/[submissionId]?locale=cs` → `next/og` (satori + resvg) → PNG 1200×630, cache 1 den na CDN. Fonty jsou vendorované v `src/lib/og/fonts/` (Inter, Space Grotesk). Obsah: archetyp + ilustrace, vlajka, „Planeta přežije na 61 %", „Ty: 74 %", URL. `result/[id]` má OG meta tagy na tento endpoint. Ilustrace archetypů jsou statické SVG v `public/archetypes/`, ne generované.

---

## 14. Bezpečnost a soukromí

- Klient nikdy nepíše do DB přímo a nikdy s ní nemluví: jediné připojení drží Next.js server (`src/lib/db/server.ts`, `import "server-only"`). Prohlížeč vidí jen `/api/*` a SSE.
- `.env`: `DATABASE_URL`, `PGSSLMODE`, `REDIS_URL`, `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `IP_SALT`, `CRON_SECRET`, `ADMIN_TOKEN`, `AUTH_SECRET`, `GOOGLE_*`, `APPLE_*`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `PLANETCHECK_INTERNAL_CRON` (viz `.env.example`). V produkci `env()` odmítne startovat s dev/placeholder hodnotami tajemství.
- Cron endpointy vyžadují `Authorization: Bearer ${CRON_SECRET}`.
- GDPR: **hlasy** neobsahují žádná osobní data; ověřená vrstva drží jen hash OAuth subjectu. Export dat obsahuje jen agregace, nikdy řádky submissions.
- **Newsletter (migrace `0006`)** je jediné místo v produktu, kde se ukládá osobní údaj, a je to vědomé rozhodnutí Hynka z 2026-09-05, ne vedlejší efekt. Pravidla jsou zapsaná ve schématu, ne jen v aplikaci:
  - **Double opt-in.** Řádek je `pending`, dokud čtenář neklikne na odkaz, který dostal jen on. Bez nakonfigurovaného odesílatele se formulář vůbec nezobrazí a endpoint vrací 503 — sbírat adresy, které nelze potvrdit, je zbytečné i protiprávní.
  - **Potvrzovací token se ukládá jen jako hash** (`sha256(AUTH_SECRET || token)`), takže únik databáze nedovolí potvrdit cizí adresu.
  - **Odhlašovací token se neukládá vůbec.** Je to HMAC z `id` řádku, odvozený při každém odeslání a ověřený při použití. V databázi tedy není co uniknout.
  - **Odhlášení je POST za tlačítkem.** Poštovní filtry proklikávají odkazy; GET by odhlašoval lidi, kteří o to nepožádali. Stejná URL slouží jako `List-Unsubscribe` s `List-Unsubscribe-Post` (RFC 8058), takže jde odhlásit i jedním klikem z klienta.
  - **Retence.** Nepotvrzené adresy se mažou po 14 dnech, odhlášené po 30. Obojí dělá `newsletter_purge` v hodinovém jobu.
  - **Endpoint neprozradí, kdo je na seznamu.** Odpověď je vždy stejná, ať adresa existuje nebo ne.
  - Posílá se nanejvýš jeden dopis na kolo (`last_sent_slug`), a jen lidem, kteří potvrdili odběr **před** startem toho kola — kdo se přihlásí po dohrání, nedostane e-mail o kole, které právě hrál.
- Symetrie formulací: každá otázka dotýkající se konkrétního státu musí mít `review_required` a druhou otázku se zrcadleným rámováním v tom samém kole.

---

## 15. Fáze pro Claude Code

Každá fáze končí zeleným `pnpm test` a e2e průchodem. Nezačínej další fázi, dokud předchozí není hotová.

**Fáze 0 — Skeleton** ✅
- Next.js 15 + TS + Tailwind + next-intl (cs/sk/en), DB vrstva (pg + PGlite), migrace `0001–0003`, `sync-content` s kotvami a týdenním kolem, `seed-synthetic` (10 000 hlasů, 40 zemí).
- Hotovo, když: `/cs/play` zobrazí otázky z DB, `pnpm seed` naplní data.

**Fáze 1 — Herní smyčka** ✅
- SwipeDeck (drag + tlačítka + klávesnice), MetaSlider, volitelný DemographicsStep, `POST /api/vote` s Turnstile, flood guard, dedupe, scoring, Verdict obrazovka.
- Hotovo, když: e2e test odehraje kolo na mobilním viewportu do 90 s, druhý pokus vrátí 409.

**Fáze 2 — Výsledky** ✅
- `/planet`: Ekg (SSE), TwoCamps, WorldMap, ContradictionMeter, RulerSwitch (filtry), CountryBoard s odemykáním, ArchetypeDonut, TrendLine; `/country/[code]`; OG kartička.
- Hotovo, když: všechny viz komponenty mají Storybook-like stránku `/dev/viz` se syntetickými daty a fungují bez sítě.

**Fáze 3 — Důvěra a vážení** ✅ (OAuth vyžaduje klientské klíče od Hynka)
- OAuth link (Google/Apple), `verified` vrstva, `recompute` (raking), `country_stats`, tituly, `/methodology` generovaná z konstant, `/data` export.
- Hotovo, když: unit testy raking na známém vzorku sedí na 3 desetinná místa, výsledky ukazují raw i weighted.

**Fáze 4 — Jazyky a narátor** 🟡 (kód hotov; 20 locale se generuje `pnpm translate` s API klíčem)
- `translate.ts`, `review_required` gating, narátor job + schvalovací endpoint.
- Hotovo, když: přepnutí locale nezmění žádné číslo, narátor post se bez schválení nikde nezobrazí.

**Fáze 5 — Virální vrstva** 🟡 (embed hotov)
- **Duel zemí** ✅ — kurátorované dvojice v `content/duels.yaml` (kódy se ověřují proti `data/countries.json`), stránky `/duel` a `/duel/[key]`, čistá funkce `src/lib/duel/compare.ts` (shoda = 100 − ½·Σ|aᵢ−bᵢ| přes možnosti otázky, raw i weighted), komponenta `DuelBoard` s ukázkou na `/dev/viz`. Duel se nepočítá pro libovolnou dvojici — jen pro ty z obsahu, aby produkt nešel namířit na dvojici, kterou jsme nevybrali.
- **Proroctví** ✅ — `content/prophecies.yaml` (každé musí v blurbu jmenovat zdroj, který ho rozhodne; `review_required: true` u všech, aby se přesná čísla nedostala do nezkontrolovaného strojového překladu), migrace `0004`, stránka `/prophecies`, čisté funkce `src/lib/prophecy/score.ts` (Brier, dovednost proti hodu mincí, kalibrace). Průměr planety se hráči **ukáže až po jeho tipu** — stejné pravidlo jako u meta otázky. Proroctví po `closes_at` zavírá `close_due_prophecies` v recompute jobu; rozhodnutí zůstává ruční.
- **Školní mód** ✅ — `/class` vygeneruje kód, studenti hrají přes `/play?class=KÓD`, `/class/[KÓD]` porovná třídu s planetou. Detaily a soukromí viz §5.
- Embed widget (`/embed/planet` iframe) ✅.

- **Oznamování dalších kol** ✅ — dvě cesty. (1) `/api/calendar/rounds.ics?locale=…` je odebíratelný kalendář rozvrhu kol (`src/lib/calendar/ics.ts`, čistá funkce); připomínku drží kalendář čtenáře, server se nikdy nedozví, že existuje, a nestojí to žádné údaje. (2) Dobrovolný e-mailový odběr termínů, jediné místo v produktu s osobním údajem — pravidla v §14. Výsledková obrazovka nabídne obojí a řekne, které téma přijde a kdy.

**Fáze 5 je hotová.** Zbývá potvrdit formulace šesti proroctví a nasadit reálné Turnstile klíče (viz §16).

---

## 16. Otevřené otázky (rozhodni před fází 3)

- Ověření přes SMS OTP stojí peníze per hlas; MVP má jen Google/Apple (bez Supabase Auth), SMS přidat, až bude důvod.
- Rozhodnuto v implementaci, potvrdit: `cell_clamp` [0.2, 5.0] pro raking faktory; index rozporů = podíl hlasů s ≥1 aktivovanou dvojicí; realism bez dat = `null` a survival se přenormuje; export slučuje země < 30 hlasů do `--`.
- Zda „realism" počítat proti surovému nebo váženému podílu — návrh: vážený, ale ukázat hráči oba.
- Kolik anchor otázek nechat trvale (návrh 5) vs. rotovat.
- **Turnstile běží na testovacích klíčích Cloudflare**, které vždy projdou. Před spuštěním pro veřejnost je nutné nasadit reálné klíče: bez tajného klíče se každý hlas oflaguje `turnstile_unavailable` a zmizí z veřejných čísel.
- Formulace šesti proroctví v `content/prophecies.yaml` jsou návrh; mechanismus je schválený, znění potvrdit před prvním uzavřením.
- **Newsletter potřebuje odesílací službu.** Bez `RESEND_API_KEY` a `NEWSLETTER_FROM` se formulář nezobrazí a nic se nesbírá. Než se spustí, patří k němu i zásady zpracování údajů s identifikací správce (kdo je provozovatel, kontakt, doba uchování) — text z §14 je technický popis, ne právní dokument.
