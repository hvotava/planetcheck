import "server-only";
import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { getRepo } from "@/lib/db/server";
import { weeklySchedule } from "@/lib/api/rounds";
import { buildRoundEmail } from "@/lib/newsletter/templates";
import { getEmailSender } from "@/lib/newsletter/sender";
import { unsubscribeToken } from "@/lib/newsletter/tokens";

export type NewsletterJobResult = { skipped: boolean; reason?: string; slug?: string; sent: number; failed: number; purged?: { pending_deleted: number; unsubscribed_deleted: number } };

/**
 * Tells confirmed readers that a new theme has opened, at most once per round each.
 *
 * Idempotent by `last_sent_slug`, so a retry or a second replica cannot send twice, and it
 * only ever mails about the round that is actually running.
 */
export async function runNewsletterJob(batch = 200): Promise<NewsletterJobResult> {
  const e = env();
  const sender = getEmailSender();
  const repo = await getRepo();

  const lease = await repo.acquireJobLease("newsletter", 10 * 60);
  if (!lease.acquired) return { skipped: true, reason: "lease", sent: 0, failed: 0 };

  try {
    const purged = await repo.newsletterPurge();
    if (!sender) {
      await repo.releaseJobLease("newsletter", "no_sender");
      return { skipped: true, reason: "no_sender", sent: 0, failed: 0, purged };
    }

    const live = (await weeklySchedule("en")).find((r) => r.live);
    if (!live) {
      await repo.releaseJobLease("newsletter", "no_round");
      return { skipped: true, reason: "no_round", sent: 0, failed: 0, purged };
    }

    const recipients = await repo.newsletterRecipients({ slug: live.slug, starts_at: live.starts_at, limit: batch });
    const site = e.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    const sentIds: string[] = [];
    let failed = 0;

    for (const r of recipients) {
      // Derived fresh from the row id every time, so nothing had to be stored for it.
      const tok = encodeURIComponent(unsubscribeToken(r.id, e.AUTH_SECRET));
      const unsubHuman = `${site}/${r.locale}/newsletter/unsubscribe?token=${tok}`;
      const unsubOneClick = `${site}/api/newsletter/unsubscribe?token=${tok}`;
      const t = await getTranslations({ locale: r.locale, namespace: "newsletter" });
      const mail = buildRoundEmail(
        {
          subject: t("mail.roundSubject", { title: localisedTitle(live.title) }),
          intro: t("mail.roundIntro"),
          blurb: live.blurb,
          action: t("mail.roundAction"),
          unsubscribe: t("mail.roundUnsubscribe"),
          signature: t("mail.signature"),
        },
        `${site}/${r.locale}/play`,
        unsubHuman,
      );
      const res = await sender.send({ to: r.email, subject: mail.subject, text: mail.text, unsubscribeUrl: unsubOneClick });
      if (res.ok) sentIds.push(r.id);
      else failed++;
    }

    if (sentIds.length) await repo.newsletterMarkSent(live.slug, sentIds);
    await repo.releaseJobLease("newsletter", "ok");
    return { skipped: false, slug: live.slug, sent: sentIds.length, failed, purged };
  } catch (err) {
    await repo.releaseJobLease("newsletter", "error", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

function localisedTitle(title: string): string {
  return title;
}
