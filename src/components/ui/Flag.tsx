/** Emoji flag from an ISO-3166 alpha-2 code (regional indicator symbols). Unknown → globe. */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "🌍";
  const base = 0x1f1e6;
  const [a, b] = code.toUpperCase();
  return String.fromCodePoint(base + (a!.charCodeAt(0) - 65), base + (b!.charCodeAt(0) - 65));
}

export function Flag({ code, className = "" }: { code: string | null | undefined; className?: string }) {
  return (
    <span className={`inline-block leading-none ${className}`} aria-hidden="true">
      {flagEmoji(code)}
    </span>
  );
}
