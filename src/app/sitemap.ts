import type { MetadataRoute } from "next";
import { LOCALES } from "@/lib/i18n/locales";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const paths = ["", "/play", "/planet", "/compass", "/methodology", "/data"];
  return LOCALES.flatMap((l) =>
    paths.map((p) => ({ url: `${site}/${l}${p}`, changeFrequency: p === "/planet" ? ("hourly" as const) : ("daily" as const), priority: p === "" ? 1 : 0.7 })),
  );
}
