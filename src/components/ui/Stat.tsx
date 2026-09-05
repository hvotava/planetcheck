import type { ReactNode } from "react";

export function Stat({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card flex flex-col gap-2 p-4">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <div>{children}</div>
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </div>
  );
}
