import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestRepo } from "./helpers";

let ctx: Awaited<ReturnType<typeof createTestRepo>>;

beforeAll(async () => {
  ctx = await createTestRepo();
});
afterAll(async () => {
  await ctx.close();
});

async function subscribe(email: string, confirmHash: string, locale = "cs") {
  return ctx.repo.newsletterSubscribe({ email, locale, confirm_token_hash: confirmHash, ip_hash: "test" });
}

describe("newsletter", () => {
  it("normalises the address and starts a pending, double opt-in row", async () => {
    const res = await subscribe("  Hynek@Example.CZ  ", "h1");
    expect(res).toMatchObject({ ok: true, code: "pending", send_confirmation: true });
    const rows = await ctx.db.query<{ email: string; status: string; confirmed_at: string | null }>("select email, status, confirmed_at from newsletter_subscribers");
    expect(rows[0]).toMatchObject({ email: "hynek@example.cz", status: "pending", confirmed_at: null });
  });

  it("a pending address is not a recipient of anything", async () => {
    const list = await ctx.repo.newsletterRecipients({ slug: "2026-w38", starts_at: new Date(Date.now() + 86_400_000).toISOString() });
    expect(list).toEqual([]);
  });

  it("confirms with the token and clears it afterwards", async () => {
    const res = await ctx.repo.newsletterConfirm("h1");
    expect(res).toMatchObject({ ok: true, code: "confirmed", locale: "cs" });
    const rows = await ctx.db.query<{ status: string; confirm_token_hash: string | null }>("select status, confirm_token_hash from newsletter_subscribers");
    expect(rows[0]).toMatchObject({ status: "confirmed", confirm_token_hash: null });
  });

  it("refuses a token that was already spent, so a replayed link does nothing", async () => {
    expect(await ctx.repo.newsletterConfirm("h1")).toMatchObject({ ok: false, code: "invalid_token" });
  });

  it("re-subscribing a confirmed address changes nothing and sends nothing", async () => {
    const res = await subscribe("hynek@example.cz", "h2");
    expect(res).toMatchObject({ ok: true, code: "already_confirmed", send_confirmation: false });
    const rows = await ctx.db.query<{ n: number }>("select count(*)::int as n from newsletter_subscribers");
    expect(rows[0]!.n).toBe(1);
  });

  it("mails a confirmed reader about a round that started after they joined, once", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const first = await ctx.repo.newsletterRecipients({ slug: "2026-w38", starts_at: future });
    expect(first.map((r) => r.email)).toEqual(["hynek@example.cz"]);
    await ctx.repo.newsletterMarkSent("2026-w38", [first[0]!.id]);
    expect(await ctx.repo.newsletterRecipients({ slug: "2026-w38", starts_at: future })).toEqual([]);
    // a different round is a new letter
    expect((await ctx.repo.newsletterRecipients({ slug: "2026-w39", starts_at: future })).length).toBe(1);
  });

  it("never mails about a round that was already running when they subscribed", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(await ctx.repo.newsletterRecipients({ slug: "2026-w40", starts_at: past })).toEqual([]);
  });

  it("unsubscribes by row id and stops being a recipient", async () => {
    const rows = await ctx.db.query<{ id: string }>("select id from newsletter_subscribers");
    const res = await ctx.repo.newsletterUnsubscribe(rows[0]!.id);
    expect(res).toMatchObject({ ok: true, code: "unsubscribed" });
    expect(await ctx.repo.newsletterRecipients({ slug: "2026-w41", starts_at: new Date(Date.now() + 86_400_000).toISOString() })).toEqual([]);
    // unsubscribing twice is not an error for the reader
    expect(await ctx.repo.newsletterUnsubscribe(rows[0]!.id)).toMatchObject({ ok: true, code: "already" });
  });

  it("lets an unsubscribed reader come back through the full double opt-in", async () => {
    const res = await subscribe("hynek@example.cz", "h3");
    expect(res).toMatchObject({ ok: true, code: "pending", send_confirmation: true });
    expect(await ctx.repo.newsletterConfirm("h3")).toMatchObject({ ok: true, code: "confirmed" });
  });

  it("purges addresses nobody confirmed and long-gone unsubscribes", async () => {
    await subscribe("stale@example.cz", "h4");
    await ctx.db.query("update newsletter_subscribers set created_at = now() - interval '30 days' where email = 'stale@example.cz'");
    const before = await ctx.repo.newsletterStats();
    expect(Number(before.pending)).toBe(1);
    const purged = await ctx.repo.newsletterPurge(14, 30);
    expect(purged.pending_deleted).toBe(1);
    const after = await ctx.repo.newsletterStats();
    expect(Number(after.pending)).toBe(0);
  });

  it("refuses an empty address", async () => {
    expect(await ctx.repo.newsletterSubscribe({ email: "   ", locale: "cs", confirm_token_hash: "x" })).toMatchObject({ ok: false, code: "invalid" });
  });
});
