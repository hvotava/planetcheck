"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { api, ClientApiError } from "@/lib/api/client";
import type { PlayOption, PlayQuestion, PlayRound, QuestionShares } from "@/types/api";
import type { Demographics } from "@/types/domain";
import { DemographicsStep } from "./DemographicsStep";
import { MetaSlider } from "./MetaSlider";
import { PlanetFeedback, type MetaReveal } from "./PlanetFeedback";
import { ProgressDots } from "./ProgressDots";
import { SwipeDeck } from "./SwipeDeck";
import { TurnstileWidget } from "./TurnstileWidget";
import { MoreRounds } from "./MoreRounds";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; reason: "no_round" | "generic" }
  | { kind: "already"; submissionId: string }
  | { kind: "closed" }
  | { kind: "question"; index: number }
  | { kind: "feedback"; index: number; chosenId: string }
  | { kind: "demographics" }
  | { kind: "submitting" }
  | { kind: "submitError"; message: string };

/** The 90-second loop (ARCHITECTURE §6 client side). Owns all state; children are pure. */
export function PlayClient() {
  const locale = useLocale();
  const t = useTranslations("play");
  const tc = useTranslations("common");
  const router = useRouter();

  const [round, setRound] = useState<PlayRound | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const answers = useRef(new Map<string, string>());
  const guesses = useRef(new Map<string, number>());
  const shares = useRef(new Map<string, QuestionShares>());
  const token = useRef<string | null>(null);
  const demographics = useRef<Demographics | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  /**
   * The query has to be read reactively, not once on mount. Going from /play to
   * /play?round=anchor is the same route, so React keeps this component mounted: a
   * mount-only effect never re-runs and the deck would silently never change.
   */
  const searchParams = useSearchParams();
  const roundSlug = useMemo(() => {
    const r = searchParams.get("round");
    return r && /^[a-z0-9-]{1,40}$/.test(r) ? r : null;
  }, [searchParams]);
  // School mode: /play?class=ABC123. An unknown code is ignored by the server.
  const classCode = useMemo(() => {
    const c = searchParams.get("class");
    return c && /^[A-Za-z0-9]{6}$/.test(c) ? c.toUpperCase() : null;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    // A different deck means a fresh game: the previous round's answers must not carry over.
    answers.current = new Map();
    guesses.current = new Map();
    shares.current = new Map();
    setRound(null);
    setPhase({ kind: "loading" });
    api<PlayRound>(`/api/rounds/current?locale=${locale}${roundSlug ? `&round=${encodeURIComponent(roundSlug)}` : ""}`)
      .then((r) => {
        if (cancelled) return;
        setRound(r);
        if (r.already_voted) setPhase({ kind: "already", submissionId: r.already_voted.submission_id });
        else if (r.ends_at && new Date(r.ends_at).getTime() < Date.now()) setPhase({ kind: "closed" });
        else setPhase({ kind: "question", index: 0 });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPhase({ kind: "error", reason: e instanceof ClientApiError && e.code === "no_round" ? "no_round" : "generic" });
      });
    return () => {
      cancelled = true;
    };
    // Deliberately only the deck identity: translation functions must never restart a game.
  }, [locale, roundSlug]);

  const questions = useMemo(() => round?.questions ?? [], [round]);
  const total = questions.length;

  const fetchShares = useCallback(
    async (questionId: string) => {
      if (shares.current.has(questionId)) return shares.current.get(questionId)!;
      const q = round?.geo_country ? `?country=${round.geo_country}` : "";
      const s = await api<QuestionShares>(`/api/results/question/${questionId}${q}`);
      shares.current.set(questionId, s);
      return s;
    },
    [round?.geo_country],
  );

  // prefetch shares of the meta target while the player is guessing, so the reveal after the
  // target card is instant (nothing is shown on the meta card itself)
  useEffect(() => {
    if (phase.kind !== "question") return;
    const q = questions[phase.index];
    if (q?.type === "meta" && q.target) void fetchShares(q.target.question_id).catch(() => undefined);
  }, [phase, questions, fetchShares]);

  /** The guess made on the meta card that targets `q`, paired with the planet's current share — revealed only in q's feedback. */
  const metaRevealFor = useCallback(
    (q: PlayQuestion): MetaReveal | null => {
      const meta = questions.find((m) => m.type === "meta" && m.target?.question_id === q.id);
      const guess = meta ? guesses.current.get(meta.id) : undefined;
      if (!meta?.target || guess == null) return null;
      const s = shares.current.get(q.id);
      const actual = s && s.total_raw > 0 ? (s.options.find((o) => o.option_id === meta.target!.option_id)?.share_weighted ?? null) : null;
      return { guess, actual };
    },
    [questions],
  );

  const advance = useCallback(
    (from: number) => {
      const nextIndex = from + 1;
      if (nextIndex >= total) setPhase({ kind: "demographics" });
      else setPhase({ kind: "question", index: nextIndex });
    },
    [total],
  );

  const onAnswer = useCallback(
    (q: PlayQuestion, index: number, option: PlayOption) => {
      answers.current.set(q.id, option.id);
      setPhase({ kind: "feedback", index, chosenId: option.id });
      void fetchShares(q.id)
        .then(rerender)
        .catch(() => undefined);
    },
    [fetchShares],
  );

  const submit = useCallback(
    async (d: Demographics | null) => {
      if (!round) return;
      if (d) demographics.current = d;
      setPhase({ kind: "submitting" });
      try {
        const res = await api<{ submissionId: string }>("/api/vote", {
          method: "POST",
          body: JSON.stringify({
            roundId: round.id,
            answers: [...answers.current].map(([questionId, optionId]) => ({ questionId, optionId })),
            metaGuesses: [...guesses.current].map(([questionId, guess]) => ({ questionId, guess })),
            demographics: demographics.current ?? undefined,
            token: token.current,
            loadedAt: round.loaded_at,
            locale,
            classCode,
          }),
        });
        router.push(`/result/${res.submissionId}`);
      } catch (e) {
        if (e instanceof ClientApiError && e.code === "duplicate") {
          const id = (e.details as { submissionId?: string } | undefined)?.submissionId;
          if (id) return router.push(`/result/${id}`);
        }
        if (e instanceof ClientApiError && e.code === "round_closed") return setPhase({ kind: "closed" });
        setPhase({ kind: "submitError", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [round, locale, router, classCode],
  );

  const current = useMemo(() => (phase.kind === "question" || phase.kind === "feedback" ? questions[phase.index] : undefined), [phase, questions]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8 pt-4">
      {round && (phase.kind === "question" || phase.kind === "feedback") ? (
        <div className="mb-4 flex flex-col items-center gap-2">
          <ProgressDots questions={questions} current={phase.index} />
          <p className="text-xs text-faint">
            {round.title}
            {classCode ? <span className="ml-2 rounded-full border border-info/50 px-2 py-0.5 text-info">{t("classBadge", { code: classCode })}</span> : null}
          </p>
        </div>
      ) : null}

      {round?.turnstile_site_key ? <TurnstileWidget siteKey={round.turnstile_site_key} onToken={(tok) => (token.current = tok)} /> : null}

      <AnimatePresence mode="wait">
        {phase.kind === "loading" ? (
          <motion.p key="loading" className="animate-pulse-soft py-20 text-center text-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {tc("loading")}
          </motion.p>
        ) : null}

        {phase.kind === "error" ? (
          <motion.div key="error" className="card mx-auto max-w-sm p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-lg font-bold">{tc("error")}</p>
            <p className="mt-1 text-sm text-muted">{phase.reason === "no_round" ? t("closedText") : tc("error")}</p>
            <Button className="mt-4" variant="secondary" onClick={() => location.reload()}>
              {tc("retry")}
            </Button>
          </motion.div>
        ) : null}

        {phase.kind === "already" ? (
          <motion.div key="already" className="card mx-auto max-w-sm p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-4xl">🗳️</p>
            <h2 className="mt-2 text-xl font-bold">{t("alreadyVotedTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("alreadyVotedText")}</p>
            <Link href={`/result/${phase.submissionId}`} className="mt-5 inline-flex rounded-full bg-accent px-5 py-3 font-semibold text-bg" data-testid="already-voted-cta">
              {t("alreadyVotedCta")}
            </Link>
            <div className="mt-4 text-left">
              <MoreRounds locale={locale} excludeSlug={round?.slug} />
            </div>
          </motion.div>
        ) : null}

        {phase.kind === "closed" ? (
          <motion.div key="closed" className="card mx-auto max-w-sm p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-4xl">⏳</p>
            <h2 className="mt-2 text-xl font-bold">{t("closedTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("closedText")}</p>
            <Link href="/planet" className="mt-5 inline-flex rounded-full bg-accent px-5 py-3 font-semibold text-bg">
              {t("closedCta")}
            </Link>
          </motion.div>
        ) : null}

        {phase.kind === "question" && current && current.type === "choice" ? (
          <motion.div key={`q-${current.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SwipeDeck question={current} next={questions[phase.index + 1]} index={phase.index} total={total} onAnswer={(o) => onAnswer(current, phase.index, o)} />
          </motion.div>
        ) : null}

        {phase.kind === "question" && current && current.type === "meta" ? (
          <motion.div key={`m-${current.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MetaSlider
              question={current}
              index={phase.index}
              total={total}
              onGuess={(g) => {
                guesses.current.set(current.id, g);
                advance(phase.index);
              }}
            />
          </motion.div>
        ) : null}

        {phase.kind === "feedback" && current ? (
          <motion.div key={`f-${current.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <PlanetFeedback
              question={current}
              chosenId={phase.chosenId}
              shares={shares.current.get(current.id) ?? null}
              countryCode={round?.geo_country ?? null}
              metaReveal={metaRevealFor(current)}
              onNext={() => advance(phase.index)}
            />
          </motion.div>
        ) : null}

        {phase.kind === "demographics" && round ? (
          <motion.div key="demo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <DemographicsStep countries={round.countries} geoCountry={round.geo_country} submitting={false} onSubmit={(d) => void submit(d)} />
          </motion.div>
        ) : null}

        {phase.kind === "submitting" ? (
          <motion.div key="submitting" className="py-20 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="animate-pulse-soft text-4xl">🛰️</p>
            <p className="mt-3 text-muted">{t("sending")}</p>
          </motion.div>
        ) : null}

        {phase.kind === "submitError" ? (
          <motion.div key="submitError" className="card mx-auto max-w-sm p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2 className="text-xl font-bold">{t("errorTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("errorText")}</p>
            <p className="mt-1 font-mono text-xs text-faint">{phase.message}</p>
            <Button className="mt-4" onClick={() => void submit(null)}>
              {t("errorRetry")}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
