import { expect, test } from "@playwright/test";

/**
 * ARCHITECTURE §17. The Kompas is a 20-card deck with a score, so the two things worth
 * proving end to end are that a whole run reaches a result, and that the correct answers
 * are nowhere in the browser until it does.
 */
test.describe("kompas on mobile", () => {
  test("the deck never carries the correct answers", async ({ request }) => {
    const res = await request.get("/api/compass?locale=cs");
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).not.toContain('"correct"');
    expect(body).not.toContain("pessimistic");
    expect(body).not.toContain("optimistic");
    expect(body).not.toContain("i18n_answer");
    const json = JSON.parse(body) as { data: { questions: Array<{ section: string; options: unknown[] }>; facts_total: number } };
    expect(json.data.facts_total).toBe(12);
    expect(json.data.questions).toHaveLength(20);
    for (const q of json.data.questions.filter((x) => x.section === "fact")) expect(q.options).toHaveLength(3);
  });

  test("play the whole deck, see the reveal, then be refused a second run", async ({ page, request, context }) => {
    test.setTimeout(180_000);
    await page.goto("/cs/compass");

    await page.getByTestId("compass-start").click();

    for (let card = 0; card < 25; card++) {
      if (/\/compass\/[0-9a-f-]{36}/.test(page.url())) break;
      // The card mounts only after the previous one has animated out, so this has to wait
      // rather than probe: isVisible() would report false on a card that is on its way in.
      const options = page.getByTestId("options").getByRole("button");
      try {
        await options.first().waitFor({ state: "visible", timeout: 10_000 });
      } catch {
        break;
      }
      await options.first().click();
      const next = page.getByRole("button", { name: /Další/ });
      await next.waitFor({ state: "visible", timeout: 15_000 });
      await next.click();
    }

    await page.waitForURL(/\/cs\/compass\/[0-9a-f-]{36}/, { timeout: 60_000 });

    // the score, and the honest comparison against random clicking
    await expect(page.getByTestId("compass-score")).toBeVisible();
    await expect(page.getByTestId("compass-score")).toContainText("/ 12");
    await expect(page.getByText(/Náhodné klikání/)).toBeVisible();

    // the reveal: every fact now shows the true answer and where it came from
    await expect(page.getByText("Otázka po otázce")).toBeVisible();
    await expect(page.getByText("Správně je").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Zdroj:/ }).first()).toBeVisible();

    // the profile section has no right answer, only a position
    await expect(page.getByText("Čemu věříš")).toBeVisible();

    // a second run of the same version is refused, never silently replaced
    const cookies = await context.cookies();
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const deck = await request.get("/api/compass?locale=cs", { headers: { cookie } });
    const data = (await deck.json()) as { data: { version: number; questions: Array<{ id: string; options: Array<{ id: string }> }> } };
    const body = {
      version: data.data.version,
      answers: data.data.questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
      loadedAt: new Date(Date.now() - 300_000).toISOString(),
      locale: "cs",
    };
    const replay = await request.post("/api/compass", { data: body, headers: { cookie } });
    expect(replay.status()).toBe(409);
    const json = (await replay.json()) as { ok: boolean; error: { code: string } };
    expect(json.error.code).toBe("duplicate");

    // and the deck page now points at the existing result instead of starting over
    await page.goto("/cs/compass");
    await expect(page.getByTestId("compass-already")).toBeVisible({ timeout: 20_000 });
  });

  test("planet stats and shares answer without a submission", async ({ request }) => {
    const stats = await request.get("/api/compass/stats");
    expect(stats.ok()).toBeTruthy();
    const s = (await stats.json()) as { ok: boolean; data: { chance: number; questions: unknown[] } };
    expect(s.ok).toBe(true);
    expect(s.data.chance).toBeCloseTo(1 / 3, 2);
    expect(s.data.questions.length).toBeGreaterThan(0);

    const shares = await request.get("/api/compass/shares");
    expect(shares.ok()).toBeTruthy();
    const sh = (await shares.json()) as { data: { questions: unknown[] } };
    expect(sh.data.questions).toHaveLength(20);
  });
});
