import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { fail, handle, ok } from "@/lib/api/respond";
import { clientIp, hashIp } from "@/lib/trust/fingerprint";
import { getFloodLimiter } from "@/lib/trust/ratelimit";
import { verifyTurnstile } from "@/lib/trust/turnstile";
import { createToken, hashToken, normaliseEmail } from "@/lib/newsletter/tokens";
import { buildConfirmationEmail } from "@/lib/newsletter/templates";
import { getEmailSender } from "@/lib/newsletter/sender";
import { routing } from "@/lib/i18n/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().min(6).max(254),
  locale: z.string().max(10).optional(),
  token: z.string().max(4096).nullable().optional(),
});

/**
 * POST /api/newsletter — start a double opt-in subscription.
 *
 * The response never says whether the address was already on the list: that would turn this
 * endpoint into a way to test whether someone subscribed. It always reports the same success.
 */
export const POST = handle(async (req) => {
  const e = env();
  const sender = getEmailSender();
  // No sender means no confirmation mail, which means no lawful signup. Refuse rather than bank addresses.
  if (!sender) return fail(503, "newsletter_disabled", "The newsletter is not configured.");

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "invalid_body", "Expected { email }.");
  const email = normaliseEmail(body.data.email);
  if (!email) return fail(400, "invalid_email", "That does not look like an email address.");

  const ipHash = hashIp(clientIp(req.headers), e.IP_SALT);
  const limiter = await getFloodLimiter({ redisUrl: e.REDIS_URL });
  if (!(await limiter.hit(`nl:${ipHash}`)).allowed) return fail(429, "too_many_requests", "Slow down a little.");

  const turnstile = await verifyTurnstile(body.data.token, e.TURNSTILE_SECRET, clientIp(req.headers));
  if (turnstile.ok === false && turnstile.reason === "failed") return fail(403, "turnstile_failed", "Verification failed.");

  const asked = body.data.locale ?? routing.defaultLocale;
  const locale = (routing.locales as readonly string[]).includes(asked) ? asked : routing.defaultLocale;

  const confirmToken = createToken();
  const repo = await getRepo();
  const res = await repo.newsletterSubscribe({
    email,
    locale,
    confirm_token_hash: hashToken(confirmToken, e.AUTH_SECRET),
    ip_hash: ipHash,
  });

  if (res.ok && res.send_confirmation) {
    const site = e.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    const t = await getTranslations({ locale, namespace: "newsletter" });
    const mail = buildConfirmationEmail(
      {
        subject: t("mail.confirmSubject"),
        intro: t("mail.confirmIntro"),
        action: t("mail.confirmAction"),
        ignore: t("mail.confirmIgnore"),
        signature: t("mail.signature"),
      },
      `${site}/api/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`,
    );
    // A pending row is not subscribed to anything yet, so the way out is simply not to click.
    const sent = await sender.send({ to: email, subject: mail.subject, text: mail.text, unsubscribeUrl: `${site}/${locale}/newsletter` });
    if (!sent.ok) console.error("[newsletter] confirmation send failed:", sent.error);
  }

  // Identical answer either way.
  return ok({ status: "check_your_inbox" }, { status: 202 });
});
