"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProgressDots } from "@/components/game/ProgressDots";
import { SwipeDeck } from "@/components/game/SwipeDeck";
import { TurnstileWidget } from "@/components/game/TurnstileWidget";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { api, ClientApiError } from "@/lib/api/client";
import type { CompassShares, PlayCompass, PlayCompassQuestion } from "@/types/api";
import { AnswerSpread } from "./AnswerSpread";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "already"; submissionId: string }
  | { kind: "intro" }
  | { kind: "question"; index: number }
  | { kind: "feedback"; index: number; chosenId: string }
  | { kind: "submitting" }
  | { kind: "submitError"; message: string };

/**
 * The Kompas deck (ARCHITECTURE §17). Same rhythm as a round: one card, then what other
 * people said. The one difference that matters is what it withholds — which answer is
 * true arrives only on the result page, once the run has been committed.
 */
export function CompassDeck() {
  const locale = useLocale();
  const t = useTranslations("compass");
  const tc = useTranslations("common");
  const router = useRouter();

  const [deck, setDeck] = useState<PlayCompass | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const answers = useRef(new Map<string, string>());
  const shares = useRef<CompassShares | null>(null);
  const token = useRef<string | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  // next-intl hands back a new function identity on every render. Putting one in an effect's
  // dependency list restarts the deck forever, so the loader keeps them in a ref instead.
  const errorText = useRef(tc("error"));
  errorText.current = tc("error");

  useEffect(() => {
    let cancelled = false;
    api<PlayCompass>(`/api/compass?locale=${locale}`)
      .then((d) => {
        if (cancelled) return;
        setDeck(d);
        setPhase(d.already_done ? { kind: "already", submissionId: d.already_done.submission_id } : { kind: "intro" });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error", message: errorText.current });
      });
    // Prefetched once: the spread after each card must not cost a request per card.
    api<CompassShares>("/api/compass/shares")
      .then((s) => {
        if (cancelled) return;
        shares.current = s;
        rerender();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const questions = useMemo(() => deck?.questions ?? [], [deck]);
  const total = questions.length;

  const sharesFor = useCallback((questionId: string) => shares.current?.questions.find((q) => q.question_id === questionId) ?? null, []);

  const submit = useCallback(async () => {
    if (!deck) return;
    setPhase({ kind: "submitting" });
    try {
      const res = await api<{ submissionId: string }>("/api/compass", {
        method: "POST",
        body: JSON.stringify({
          version: deck.version,
          answers: [...answers.current].map(([questionId, optionId]) => ({ questionId, optionId })),
          token: token.current,
          loadedAt: deck.loaded_at,
          locale,
        }),
      });
      router.push(`/compass/${res.submissionId}`);
    } catch (e) {
      if (e instanceof ClientApiError && e.code === "duplicate") {
        const id = (e.details as { submissionId?: string } | undefined)?.submissionId;
        if (id) return router.push(`/compass/${id}`);
      }
      if (e instanceof ClientApiError && e.code === "version_changed") return setPhase({ kind: "submitError", message: t("versionChanged") });
      setPhase({ kind: "submitError", message: e instanceof Error ? e.message : String(e) });
    }
  }, [deck, locale, router, t]);

  const advance = useCallback(
    (from: number) => {
      if (from + 1 >= total) void submit();
      else setPhase({ kind: "question", index: from + 1 });
    },
    [total, submit],
  );

  const onAnswer = useCallback((q: PlayCompassQuestion, index: number, optionId: string) => {
    answers.current.set(q.id, optionId);
    setPhase({ kind: "feedback", index, chosenId: optionId });
  }, []);

  const current = phase.kind === "question" || phase.kind === "feedback" ? questions[phase.index] : undefined;
  const factsDone = current ? questions.slice(0, phase.kind === "question" || phase.kind === "feedback" ? phase.index : 0).filter((q) => q.section === "fact").length : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8 pt-4">
      {deck && (phase.kind === "question" || phase.kind === "feedback") ? (
        <div className="mb-4 flex flex-col items-center gap-2">
          <ProgressDots questions={questions.map((q) => ({ id: q.id, type: q.section === "fact" ? "choice" : "meta" }))} current={phase.index} />
          <p className="text-xs text-faint">
            {current?.section === "fact" ? `${t("factsSection")} · ${factsDone + 1}/${deck.facts_total}` : t("profileSection")}
          </p>
        </div>
      ) : null}

      {deck?.turnstile_site_key ? <TurnstileWidget siteKey={deck.turnstile_site_key} onToken={(tok) => (token.current = tok)} /> : null}

      <AnimatePresence mode="wait">
        {phase.kind === "loading" ? (
          <motion.p key="loading" className="animate-pulse-soft py-20 text-center text-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {tc("loading")}
          </motion.p>
        ) : null}

        {phase.kind === "error" ? (
          <motion.div key="error" className="card mx-auto max-w-sm p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-lg font-bold">{tc("error")}</p>
            <p className="mt-1 text-sm text-muted">{phase.message}</p>
            <Button className="mt-4" variant="secondary" onClick={() => location.reload()}>
              {tc("retry")}
            </Button>
          </motion.div>
        ) : null}

        {phase.kind === "already" ? (
          <motion.div key="already" className="card mx-auto max-w-sm p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-4xl">🧭</p>
            <h2 className="mt-2 text-xl font-bold">{t("alreadyTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("alreadyText")}</p>
            <Link href={`/compass/${phase.submissionId}`} className="mt-5 inline-flex rounded-full bg-accent px-5 py-3 font-semibold text-bg" data-testid="compass-already">
              {t("alreadyCta")}
            </Link>
          </motion.div>
        ) : null}

        {phase.kind === "intro" && deck ? (
          <motion.div key="intro" className="mx-auto max-w-md text-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="text-5xl">🧭</p>
            <h1 className="mt-3 text-3xl font-bold">{deck.title}</h1>
            <p className="mt-3 text-balance text-muted">{deck.blurb ?? t("lead")}</p>
            <ul className="mt-6 space-y-3 text-left">
              {(["how1", "how2", "how3"] as const).map((k, i) => (
                <li key={k} className="card p-4">
                  <p className="font-mono text-xs text-accent">0{i + 1}</p>
                  <p className="mt-1 font-semibold">{t(`${k}.title`)}</p>
                  <p className="mt-0.5 text-sm text-muted">{t(`${k}.text`)}</p>
                </li>
              ))}
            </ul>
            <Button className="mt-6 w-full" onClick={() => setPhase({ kind: "question", index: 0 })} data-testid="compass-start">
              {t("start")} →
            </Button>
            <p className="mt-2 text-xs text-faint">{t("duration", { facts: deck.facts_total, profile: total - deck.facts_total })}</p>
          </motion.div>
        ) : null}

        {phase.kind === "question" && current ? (
          <motion.div key={`q-${current.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SwipeDeck
              question={current}
              next={questions[phase.index + 1]}
              index={phase.index}
              total={total}
              badge={current.section === "fact" ? t("factsSection") : t("profileSection")}
              onAnswer={(o) => onAnswer(current, phase.index, o.id)}
            />
          </motion.div>
        ) : null}

        {phase.kind === "feedback" && current ? (
          <motion.div key={`f-${current.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <AnswerSpread
              question={current}
              chosenId={phase.chosenId}
              options={sharesFor(current.id)?.options ?? null}
              totalRaw={sharesFor(current.id)?.total_raw ?? 0}
              onNext={() => advance(phase.index)}
            />
          </motion.div>
        ) : null}

        {phase.kind === "submitting" ? (
          <motion.div key="submitting" className="py-20 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="animate-pulse-soft text-4xl">🧭</p>
            <p className="mt-3 text-muted">{t("sending")}</p>
          </motion.div>
        ) : null}

        {phase.kind === "submitError" ? (
          <motion.div key="submitError" className="card mx-auto max-w-sm p-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h2 className="text-xl font-bold">{t("errorTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("errorText")}</p>
            <p className="mt-1 font-mono text-xs text-faint">{phase.message}</p>
            <Button className="mt-4" onClick={() => void submit()}>
              {t("errorRetry")}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
