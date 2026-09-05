"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

export function ShareButtons({ url, text, title }: { url: string; text: string; title: string }) {
  const t = useTranslations("result");
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const enc = encodeURIComponent;
  const btn = "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold hover:border-border-strong";
  return (
    <div className="flex flex-wrap gap-2">
      {canNative ? (
        <button type="button" className={`${btn} border-accent text-accent`} onClick={() => navigator.share({ title, text, url }).catch(() => undefined)}>
          {t("shareNative")}
        </button>
      ) : null}
      <a className={btn} href={`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`} target="_blank" rel="noopener noreferrer">
        {t("shareX")}
      </a>
      <a className={btn} href={`https://wa.me/?text=${enc(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
        {t("shareWhatsApp")}
      </a>
      <a className={btn} href={`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`} target="_blank" rel="noopener noreferrer">
        {t("shareTelegram")}
      </a>
      <button
        type="button"
        className={btn}
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? tc("copied") : tc("copy")}
      </button>
    </div>
  );
}
