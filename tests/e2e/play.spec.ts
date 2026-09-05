import { expect, test } from "@playwright/test";

/**
 * ARCHITECTURE §15 phase 1 "Hotovo, když": a full round is played on a 390×844 viewport
 * within 90 seconds, and a second attempt with the same cookie is refused with 409.
 */
test.describe("play a round on mobile", () => {
  test("swipe deck → meta → demographics → verdict, then 409 on replay", async ({ page, request, context }) => {
    test.setTimeout(150_000);
    const started = Date.now();

    await page.goto("/cs/play");
    // deck loads from /api/rounds/current
    const firstOption = page.getByTestId("options").getByRole("button").first();
    await expect(firstOption).toBeVisible({ timeout: 30_000 });

    let guard = 0;
    let metaRevealSeen = false;
    while (guard++ < 20) {
      // finished? demographics form shows the submit button
      const submit = page.getByRole("button", { name: /Odeslat hlas/ });
      if (await submit.isVisible().catch(() => false)) break;

      // the meta card stays in the DOM (disabled) during its exit animation — only an enabled slider is a new meta card
      const slider = page.getByRole("slider");
      if ((await slider.isVisible().catch(() => false)) && (await slider.isEnabled().catch(() => false))) {
        // meta card: the guess is submitted and the deck moves straight to the target card —
        // nothing is revealed here (the planet's share would bias the answer)
        await slider.fill("42");
        await page.getByRole("button", { name: /Tipnout/ }).click();
        await expect(page.getByTestId("meta-reveal")).toHaveCount(0);
        continue;
      }

      const options = page.getByTestId("options").getByRole("button");
      const count = await options.count();
      if (count > 0) {
        // pick the second option (index 1) — never a honeypot in content/
        await options.nth(Math.min(1, count - 1)).click();
        // planet feedback → next; the target card of the meta question also reveals the guess
        const next = page.getByRole("button", { name: /Další/ });
        await next.waitFor();
        if (await page.getByTestId("meta-reveal").isVisible().catch(() => false)) metaRevealSeen = true;
        await next.click();
        continue;
      }
      await page.waitForTimeout(300);
    }
    expect(metaRevealSeen).toBe(true);

    await expect(page.getByRole("button", { name: /Odeslat hlas/ })).toBeVisible();
    // optional demographics: pick one chip, keep the rest empty
    await page.getByRole("button", { name: "25–34" }).click();
    await page.getByRole("button", { name: /Odeslat hlas/ }).click();

    await page.waitForURL(/\/cs\/result\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByTestId("archetype-title")).toBeVisible();
    await expect(page.getByTestId("survival-you")).toContainText("%");
    const elapsed = (Date.now() - started) / 1000;
    expect(elapsed).toBeLessThan(90);

    // second attempt: the play page recognises the cookie
    await page.goto("/cs/play");
    await expect(page.getByTestId("already-voted-cta")).toBeVisible({ timeout: 20_000 });

    // …and a raw POST with the same cookie is a 409, never a silent replacement
    const round = await request.get("/api/rounds/current?locale=cs");
    const roundJson = (await round.json()) as { data: { id: string; questions: Array<{ id: string; type: string; options: Array<{ id: string }> }> } };
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const body = {
      roundId: roundJson.data.id,
      answers: roundJson.data.questions.filter((q) => q.type === "choice").map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
      metaGuesses: roundJson.data.questions.filter((q) => q.type === "meta").map((q) => ({ questionId: q.id, guess: 50 })),
      loadedAt: new Date(Date.now() - 20_000).toISOString(),
      locale: "cs",
    };
    const res = await request.post("/api/vote", { data: body, headers: { cookie: cookieHeader } });
    expect(res.status()).toBe(409);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("duplicate");
  });

  test("landing shows live numbers and the planet page renders every section", async ({ page }) => {
    await page.goto("/cs");
    await expect(page.getByTestId("cta-play")).toBeVisible();
    await page.goto("/cs/planet");
    for (const id of ["camps", "map", "contradictions", "archetypes", "countries"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
  });

  test("switching locale does not change any number on the planet page", async ({ page }) => {
    await page.goto("/cs/planet");
    const cs = await page.locator("#countries").innerText();
    await page.goto("/en/planet");
    const en = await page.locator("#countries").innerText();
    const numbers = (s: string) => (s.match(/\d+/g) ?? []).join(",");
    expect(numbers(en)).toBe(numbers(cs));
  });

  test("API envelope, health and export", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    const h = (await health.json()) as { ok: boolean; data: { ok: boolean } };
    expect(h.ok && h.data.ok).toBe(true);
    const planet = await request.get("/api/results/planet");
    const p = (await planet.json()) as { ok: boolean; data: { totals: { raw: number; weighted: number } } };
    expect(p.ok).toBe(true);
    expect(p.data.totals.raw).toBeGreaterThan(0);
    const csv = await request.get("/api/export/current.csv");
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const cron = await request.post("/api/cron/recompute");
    expect(cron.status()).toBe(401);
    const cronOk = await request.post("/api/cron/recompute", { headers: { authorization: "Bearer e2e-cron" } });
    expect(cronOk.status()).toBe(200);
  });
});
