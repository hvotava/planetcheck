"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TurnstileWidget } from "@/components/game/TurnstileWidget";
import { api, ClientApiError } from "@/lib/api/client";

/**
 * Double opt-in signup. Renders only where the server said the newsletter is configured —
 * a form that cannot send a confirmation mail would collect addresses it can never confirm.
 */
export function SignupForm({ locale, turnstileSiteKey, compact = false }: { locale: string; turnstileSiteKey: string | null; compact?: boolean }) {
  const t = useTranslations("newsletter");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setError(null);
    try {
      await api("/api/newsletter", { method: "POST", body: JSON.stringify({ email, locale, token: token.current }) });
      setState("done");
    } catch (e) {
      const code = e instanceof ClientApiError ? e.code : null;
      setError(code === "invalid_email" ? t("invalidEmail") : code === "newsletter_disabled" ? t("disabled") : t("error"));
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4" data-testid="newsletter-done">
        <p className="font-semibold text-accent">{t("done")}</p>
        <p className="mt-1 text-xs text-muted">{t("doneHint")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} data-testid="newsletter-form">
      {turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} onToken={(tok) => (token.current = tok)} /> : null}
      {!compact ? (
        <label className="block text-sm font-semibold" htmlFor="newsletter-email">
          {t("emailLabel")}
        </label>
      ) : null}
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "mt-2 flex flex-col gap-2 sm:flex-row"}>
        <input
          id="newsletter-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          aria-label={t("emailLabel")}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={state === "busy"} className="shrink-0">
          {state === "busy" ? t("sending") : t("submit")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-faint">{t("consent")}</p>
      {error ? <p className="mt-1 text-xs text-warm">{error}</p> : null}
    </form>
  );
}
