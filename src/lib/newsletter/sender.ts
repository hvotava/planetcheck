import "server-only";
import { env } from "@/lib/env";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  /** Absolute URL put in the List-Unsubscribe header, so mail clients can offer one click. */
  unsubscribeUrl: string;
};

export interface EmailSender {
  readonly name: string;
  send(email: OutgoingEmail): Promise<{ ok: boolean; error?: string }>;
}

/**
 * Resend (https://resend.com). Chosen because it needs one key and no SDK.
 * Swap this for another provider by writing another EmailSender — nothing else knows.
 */
function resendSender(apiKey: string, from: string): EmailSender {
  return {
    name: "resend",
    async send(email) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from,
            to: [email.to],
            subject: email.subject,
            text: email.text,
            headers: {
              "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }),
        });
        if (!res.ok) return { ok: false, error: `resend ${res.status}` };
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

/** Development: prints instead of sending, so the confirmation link is visible in the log. */
export function logSender(): EmailSender {
  return {
    name: "log",
    async send(email) {
      console.log(`[mail:log] to=${email.to} subject=${email.subject}\n${email.text}`);
      return { ok: true };
    },
  };
}

/**
 * The configured sender, or null when there is none.
 *
 * Null matters: without a way to send, double opt-in is impossible, and a signup form that
 * collects addresses it can never confirm would be both useless and unlawful. Every caller
 * treats null as "the newsletter does not exist" — the form is not rendered and the endpoint
 * refuses, rather than quietly banking addresses.
 */
export function getEmailSender(): EmailSender | null {
  const e = env();
  if (e.RESEND_API_KEY && e.NEWSLETTER_FROM) return resendSender(e.RESEND_API_KEY, e.NEWSLETTER_FROM);
  if (e.NEWSLETTER_DEV_LOG === "true") return logSender();
  return null;
}

export function newsletterEnabled(): boolean {
  return getEmailSender() !== null;
}
