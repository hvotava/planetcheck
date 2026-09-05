/**
 * Email bodies. Pure: localised strings and URLs in, plain text out.
 * Plain text only — a newsletter about round dates has nothing to gain from HTML, and text
 * survives every client, screen reader and spam filter without a second rendering path.
 */

export type ConfirmStrings = { subject: string; intro: string; action: string; ignore: string; signature: string };
export type RoundStrings = { subject: string; intro: string; blurb?: string; action: string; unsubscribe: string; signature: string };

function block(lines: Array<string | undefined>): string {
  return lines.filter((l): l is string => !!l && l.length > 0).join("\n\n") + "\n";
}

export function buildConfirmationEmail(s: ConfirmStrings, confirmUrl: string): { subject: string; text: string } {
  return { subject: s.subject, text: block([s.intro, confirmUrl, s.action, s.ignore, s.signature]) };
}

export function buildRoundEmail(s: RoundStrings, playUrl: string, unsubscribeUrl: string): { subject: string; text: string } {
  return {
    subject: s.subject,
    text: block([s.intro, s.blurb, playUrl, s.action, "—", `${s.unsubscribe}\n${unsubscribeUrl}`, s.signature]),
  };
}
