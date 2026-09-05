import { notFound } from "next/navigation";

/** Any unmatched path under a valid locale renders the localised not-found page. */
export default function CatchAll() {
  notFound();
}
