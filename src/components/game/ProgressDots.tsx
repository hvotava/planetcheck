"use client";

import type { PlayQuestion } from "@/types/api";

export function ProgressDots({ questions, current }: { questions: PlayQuestion[]; current: number }) {
  return (
    <ol className="flex items-center justify-center gap-1.5" aria-label="progress">
      {questions.map((q, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        const shape = q.type === "meta" ? "rotate-45 rounded-[2px]" : "rounded-full";
        const color = state === "done" ? "bg-accent" : state === "current" ? "bg-text scale-125" : "bg-border-strong";
        return <li key={q.id} className={`h-2 w-2 transition ${shape} ${color}`} aria-current={state === "current" ? "step" : undefined} />;
      })}
    </ol>
  );
}
