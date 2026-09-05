"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Unsubscribing is a POST behind a button on purpose: mail scanners follow links, and a GET
 * would let them remove readers who never asked.
 */
export function UnsubscribeButton({ token }: { token: string }) {
  const t = useTranslations("newsletter");
  const [state, setState] = useState<"idle" | "busy" | "done" | "invalid">("idle");

  async function go() {
    setState("busy");
    try {
      const res = await fetch(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" });
      const json = (await res.json()) as { ok: boolean; data?: { status: string } };
      setState(json.ok && json.data?.status === "unsubscribed" ? "done" : "invalid");
    } catch {
      setState("invalid");
    }
  }

  if (state === "done") {
    return (
      <div data-testid="unsub-done">
        <h2 className="text-xl font-bold">{t("unsubscribe.doneTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("unsubscribe.doneText")}</p>
      </div>
    );
  }
  if (state === "invalid") {
    return (
      <div data-testid="unsub-invalid">
        <h2 className="text-xl font-bold">{t("unsubscribe.invalidTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("unsubscribe.invalidText")}</p>
      </div>
    );
  }
  return (
    <>
      <p className="text-sm text-muted">{t("unsubscribe.text")}</p>
      <Button className="mt-4" variant="secondary" disabled={state === "busy"} onClick={() => void go()} data-testid="unsub-button">
        {state === "busy" ? t("unsubscribe.working") : t("unsubscribe.button")}
      </Button>
    </>
  );
}
