"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client";

/** Mints a class code and shows the two links a teacher needs: play, and results. */
export function ClassCreator({ locale, siteUrl }: { locale: string; siteUrl: string }) {
  const t = useTranslations("classroom");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ code: string }>("/api/class", { method: "POST", body: JSON.stringify({ label: label.trim() || undefined, locale }) });
      setCode(res.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    const playUrl = `${siteUrl}/${locale}/play?class=${code}`;
    const resultsUrl = `${siteUrl}/${locale}/class/${code}`;
    return (
      <div className="card p-6" data-testid="class-created">
        <p className="text-xs uppercase tracking-wide text-muted">{t("yourCode")}</p>
        <p className="font-display text-5xl font-bold tracking-[0.2em] text-accent" data-testid="class-code">
          {code}
        </p>
        <p className="mt-3 text-sm text-muted">{t("codeHint")}</p>
        <dl className="mt-5 space-y-4 text-sm">
          <div>
            <dt className="font-semibold">{t("linkPlay")}</dt>
            <dd className="mt-1 break-all rounded-xl border border-border bg-surface-2 p-2 font-mono text-xs">{playUrl}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t("linkResults")}</dt>
            <dd className="mt-1 break-all rounded-xl border border-border bg-surface-2 p-2 font-mono text-xs">{resultsUrl}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-faint">{t("keepIt")}</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <label className="block text-sm font-semibold" htmlFor="class-label">
        {t("labelField")}
      </label>
      <input
        id="class-label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={60}
        placeholder={t("labelPlaceholder")}
        className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
      />
      <p className="mt-1 text-xs text-faint">{t("labelHint")}</p>
      <Button className="mt-4 w-full" disabled={busy} onClick={() => void create()} data-testid="class-create">
        {busy ? t("creating") : t("create")}
      </Button>
      {error ? <p className="mt-2 text-xs text-warm">{error}</p> : null}
    </div>
  );
}
