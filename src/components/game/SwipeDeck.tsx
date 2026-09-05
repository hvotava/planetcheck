"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayOption, PlayQuestion } from "@/types/api";
import { QuestionCard } from "./QuestionCard";

type Dir = "left" | "right" | "up" | "down";
const DIRS_BY_COUNT: Record<number, Dir[]> = {
  2: ["left", "right"],
  3: ["left", "up", "right"],
  4: ["left", "up", "right", "down"],
};
const ARROW: Record<Dir, string> = { left: "←", right: "→", up: "↑", down: "↓" };
const KEY: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

/**
 * One question = one card. Swipe towards an answer (2–4 directions), tap an option, or use arrow keys.
 * Pure UI: options in, chosen option out. ARCHITECTURE §15 phase 1.
 */
export function SwipeDeck({ question, next, index, total, onAnswer }: { question: PlayQuestion; next?: PlayQuestion; index: number; total: number; onAnswer: (option: PlayOption) => void }) {
  const t = useTranslations("play");
  const dirs = DIRS_BY_COUNT[question.options.length] ?? DIRS_BY_COUNT[4]!;
  const byDir = useMemo(() => Object.fromEntries(dirs.map((d, i) => [d, question.options[i]!])) as Record<Dir, PlayOption>, [dirs, question.options]);
  const [leaving, setLeaving] = useState<Dir | null>(null);
  const [focus, setFocus] = useState<Dir | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-8, 8]);

  const choose = useCallback(
    (dir: Dir) => {
      if (leaving) return;
      const opt = byDir[dir];
      if (!opt) return;
      setLeaving(dir);
      setTimeout(() => onAnswer(opt), 260);
    },
    [byDir, leaving, onAnswer],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY[e.key];
      if (dir && byDir[dir]) {
        e.preventDefault();
        setFocus(dir);
      } else if (e.key === "Enter" && focus) {
        e.preventDefault();
        choose(focus);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [byDir, choose, focus]);

  const onDrag = (_: unknown, info: PanInfo) => {
    const { x: dx, y: dy } = info.offset;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < 24 && ay < 24) return setFocus(null);
    const dir: Dir = ax >= ay ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    setFocus(byDir[dir] ? dir : null);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { x: dx, y: dy } = info.offset;
    const v = info.velocity;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const strong = Math.max(ax, ay) > 110 || Math.max(Math.abs(v.x), Math.abs(v.y)) > 700;
    if (!strong) return setFocus(null);
    const dir: Dir = ax >= ay ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    if (byDir[dir]) choose(dir);
    else setFocus(null);
  };

  const exit = leaving ? { x: leaving === "left" ? -600 : leaving === "right" ? 600 : 0, y: leaving === "up" ? -600 : leaving === "down" ? 600 : 0, opacity: 0, rotate: leaving === "left" ? -12 : leaving === "right" ? 12 : 0 } : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-sm">
        {next ? (
          <div className="absolute inset-0 translate-y-3 scale-[0.96]">
            <QuestionCard question={next} index={index + 1} total={total} dim />
          </div>
        ) : null}
        <AnimatePresence>
          <motion.div
            key={question.id}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            style={{ x, y, rotate }}
            drag
            dragElastic={0.6}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            onDrag={onDrag}
            onDragEnd={onDragEnd}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={exit ?? { scale: 1, opacity: 1, x: 0, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            whileTap={{ scale: 1.01 }}
          >
            <QuestionCard question={question} index={index} total={total} />
          </motion.div>
        </AnimatePresence>
        {/* directional hints */}
        {dirs.map((d) => {
          const o = byDir[d];
          const pos = d === "left" ? "left-0 top-1/2 -translate-y-1/2 -translate-x-2" : d === "right" ? "right-0 top-1/2 -translate-y-1/2 translate-x-2" : d === "up" ? "top-0 left-1/2 -translate-x-1/2 -translate-y-2" : "bottom-0 left-1/2 -translate-x-1/2 translate-y-2";
          return (
            <span key={d} aria-hidden="true" className={`pointer-events-none absolute ${pos} rounded-full border px-2 py-1 text-xs transition ${focus === d ? "border-accent bg-accent text-bg opacity-100" : "border-border bg-bg-elev text-muted opacity-70"}`}>
              {ARROW[d]} {o.icon}
            </span>
          );
        })}
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list" data-testid="options">
        {dirs.map((d) => {
          const o = byDir[d];
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => choose(d)}
                onMouseEnter={() => setFocus(d)}
                onMouseLeave={() => setFocus(null)}
                disabled={!!leaving}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${focus === d ? "border-accent bg-surface-2" : "border-border bg-surface hover:border-border-strong"}`}
              >
                <span className="text-xl" aria-hidden="true">
                  {o.icon}
                </span>
                <span className="flex-1">{o.text}</span>
                <kbd className="hidden text-xs text-faint md:inline">{ARROW[d]}</kbd>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-xs text-faint">
        <span className="md:hidden">{t("swipeHint")}</span>
        <span className="hidden md:inline">{t("keyboardHint")}</span>
      </p>
    </div>
  );
}
