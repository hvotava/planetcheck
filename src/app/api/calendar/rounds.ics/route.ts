import { buildRoundsCalendar } from "@/lib/calendar/ics";
import { weeklySchedule } from "@/lib/api/rounds";
import { handle } from "@/lib/api/respond";
import { env } from "@/lib/env";
import { getTranslations } from "next-intl/server";
import { routing } from "@/lib/i18n/routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/rounds.ics?locale=cs — the round schedule as a subscribable calendar.
 *
 * This is the notification channel that costs no personal data: the reader's calendar polls
 * the URL, so we never learn who subscribed, and there is nothing to store, secure or delete.
 */
export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const asked = url.searchParams.get("locale") ?? routing.defaultLocale;
  const locale = (routing.locales as readonly string[]).includes(asked) ? asked : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "common" });

  const rounds = await weeklySchedule(locale);
  const body = buildRoundsCalendar(rounds, {
    siteUrl: env().NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
    locale,
    calendarName: t("appName"),
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="prezijeme-kola.ics"',
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
});
