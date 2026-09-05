import { describe, expect, it } from "vitest";
import { buildConfirmationEmail, buildRoundEmail } from "@/lib/newsletter/templates";
import { createToken, hashToken, normaliseEmail, readUnsubscribeToken, tokensMatch, unsubscribeToken } from "@/lib/newsletter/tokens";

const SECRET = "test-secret";
const ID = "11111111-2222-3333-4444-555555555555";

describe("normaliseEmail", () => {
  it("lowercases and trims a usable address", () => {
    expect(normaliseEmail("  Hynek@Example.CZ ")).toBe("hynek@example.cz");
  });
  it("rejects obvious rubbish before we spend a send on it", () => {
    for (const bad of ["", "a@b", "no-at-sign.cz", "a b@c.cz", "a@@b.cz", "a@b..cz", "a@b.", `${"x".repeat(250)}@b.cz`]) {
      expect(normaliseEmail(bad), bad).toBeNull();
    }
  });
  it("accepts a plus tag and a subdomain", () => {
    expect(normaliseEmail("a+kola@mail.example.co.uk")).toBe("a+kola@mail.example.co.uk");
  });
});

describe("confirmation tokens", () => {
  it("hashes with the secret and never returns the token itself", () => {
    const token = createToken();
    const hash = hashToken(token, SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashToken(token, "other-secret")).not.toBe(hash);
    expect(hashToken(token, SECRET)).toBe(hash);
  });
  it("produces a fresh token every time", () => {
    expect(createToken()).not.toBe(createToken());
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips the row id", () => {
    const token = unsubscribeToken(ID, SECRET);
    expect(token.startsWith(`${ID}.`)).toBe(true);
    expect(readUnsubscribeToken(token, SECRET)).toBe(ID);
  });
  it("refuses a tampered id, a tampered mac and a different secret", () => {
    const token = unsubscribeToken(ID, SECRET);
    const [id, mac] = token.split(".");
    expect(readUnsubscribeToken(`${"9".repeat(8)}-2222-3333-4444-555555555555.${mac}`, SECRET)).toBeNull();
    expect(readUnsubscribeToken(`${id}.${mac!.slice(0, -2)}xy`, SECRET)).toBeNull();
    expect(readUnsubscribeToken(token, "another-secret")).toBeNull();
  });
  it("refuses malformed input instead of throwing", () => {
    for (const bad of ["", "nodot", ".", "not-a-uuid.abc"]) expect(readUnsubscribeToken(bad, SECRET)).toBeNull();
  });
  it("compares in constant time without crashing on unequal lengths", () => {
    expect(tokensMatch("abc", "abcd")).toBe(false);
    expect(tokensMatch("abc", "abc")).toBe(true);
  });
});

describe("email bodies", () => {
  it("puts the confirmation link on its own line and says what happens if you ignore it", () => {
    const mail = buildConfirmationEmail(
      { subject: "S", intro: "I", action: "A", ignore: "IG", signature: "Sig" },
      "https://example.org/api/newsletter/confirm?token=abc",
    );
    expect(mail.subject).toBe("S");
    expect(mail.text.split("\n\n")).toEqual(["I", "https://example.org/api/newsletter/confirm?token=abc", "A", "IG", "Sig\n"]);
  });

  it("always carries an unsubscribe line in a round letter", () => {
    const mail = buildRoundEmail(
      { subject: "Nové kolo: Voda", intro: "I", blurb: "B", action: "A", unsubscribe: "Odhlásit odběr:", signature: "Sig" },
      "https://example.org/cs/play",
      "https://example.org/cs/newsletter/unsubscribe?token=t",
    );
    expect(mail.text).toContain("Odhlásit odběr:\nhttps://example.org/cs/newsletter/unsubscribe?token=t");
    expect(mail.text).toContain("https://example.org/cs/play");
  });

  it("omits an absent blurb rather than leaving a blank gap", () => {
    const mail = buildRoundEmail({ subject: "S", intro: "I", action: "A", unsubscribe: "U:", signature: "Sig" }, "p", "u");
    expect(mail.text).not.toContain("\n\n\n");
  });
});
