/**
 * iCalendar feed of the round schedule (RFC 5545). Pure: rounds in, one string out.
 *
 * This is how we tell people when the next round starts without knowing who they are.
 * A calendar subscription needs no address, no account and no consent to store anything:
 * the reminder lives in the reader's own calendar, and the server never learns it exists.
 */

export type CalendarRound = {
  slug: string;
  title: string;
  blurb?: string;
  starts_at: string;
  ends_at: string | null;
};

export type CalendarOptions = {
  /** Absolute site origin, used for the event URL and the UID domain. */
  siteUrl: string;
  locale: string;
  calendarName: string;
  /** Fixed timestamp for DTSTAMP; defaults to now. Injectable so tests are deterministic. */
  now?: Date;
  /** How long a round with no end date should occupy the calendar. */
  openEndedHours?: number;
};

/** RFC 5545 escaping for TEXT values: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC form without punctuation: 20260914T060000Z. */
export function formatUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Folds a content line to 75 octets, continuing with a leading space, as the spec requires.
 * Counted in UTF-8 bytes, not characters, so accented titles do not produce over-long lines.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let limit = 75;
  for (const char of line) {
    if (enc.encode(current + char).length > limit) {
      out.push(current);
      current = char;
      limit = 74; // continuation lines carry a leading space
    } else {
      current += char;
    }
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

export function buildRoundsCalendar(rounds: CalendarRound[], opts: CalendarOptions): string {
  const now = opts.now ?? new Date();
  const stamp = formatUtc(now);
  const host = safeHost(opts.siteUrl);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//planetcheck//rounds//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:P1D",
    "X-PUBLISHED-TTL:P1D",
  ];

  for (const r of [...rounds].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const start = new Date(r.starts_at);
    const end = r.ends_at ? new Date(r.ends_at) : new Date(start.getTime() + (opts.openEndedHours ?? 24) * 3600_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.slug}@${host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(start)}`,
      `DTEND:${formatUtc(end)}`,
      `SUMMARY:${escapeText(opts.calendarName)}: ${escapeText(r.title)}`,
      ...(r.blurb ? [`DESCRIPTION:${escapeText(r.blurb)}`] : []),
      `URL:${opts.siteUrl}/${opts.locale}/play`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function safeHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host;
  } catch {
    return "planetcheck";
  }
}
