import { describe, expect, it } from "vitest";
import { parseTokens, planSeed, SEED_ISSUES, wasAsked, withSeededNote, type SeedIssue } from "./seed.js";

const issue = (title: string): SeedIssue => ({ title, body: `Body of ${title}` });

describe("planSeed", () => {
  it("spreads issues over the test accounts in turn", () => {
    const plan = planSeed([issue("a"), issue("b"), issue("c"), issue("d")], 3, []);
    expect(plan.map((p) => [p.issue.title, p.account])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 0],
    ]);
  });

  it("skips issues the repo already has, so a re-run opens nothing twice", () => {
    const plan = planSeed([issue("a"), issue("b"), issue("c")], 2, ["B ", "unrelated"]);
    expect(plan.map((p) => [p.issue.title, p.account])).toEqual([
      ["a", 0],
      ["c", 0],
    ]);
  });

  it("refuses to plan without any test account", () => {
    expect(() => planSeed([issue("a")], 0, [])).toThrow(/test account/i);
  });
});

describe("parseTokens", () => {
  it("reads tokens separated by commas, spaces or newlines", () => {
    expect(parseTokens("ghp_a, ghp_b\nghp_c  ghp_d,")).toEqual(["ghp_a", "ghp_b", "ghp_c", "ghp_d"]);
  });

  it("drops duplicates so one account isn't counted twice", () => {
    expect(parseTokens("ghp_a,ghp_a,ghp_b")).toEqual(["ghp_a", "ghp_b"]);
  });

  it("says which variable to set when there are none", () => {
    expect(() => parseTokens(undefined)).toThrow(/SEED_GITHUB_TOKENS/);
    expect(() => parseTokens(" , ")).toThrow(/SEED_GITHUB_TOKENS/);
  });
});

describe("wasAsked", () => {
  const link = "https://pinky-bot.vercel.app/pay?repo=o%2Fr&n=3";
  const botAsk = { userType: "Bot", body: `Pinky promise it isn't spam? [Make the promise](${link}) · Can't pay?` };

  it("is true once the issue has awaiting-promise and the bot's pay link", () => {
    expect(wasAsked({ labels: ["awaiting-promise"], comments: [botAsk] }, link)).toBe(true);
  });

  it("is false while the label or the comment is still missing", () => {
    expect(wasAsked({ labels: [], comments: [botAsk] }, link)).toBe(false);
    expect(wasAsked({ labels: ["awaiting-promise"], comments: [] }, link)).toBe(false);
  });

  it("ignores a human pasting the link and the link for another issue", () => {
    const human = { ...botAsk, userType: "User" };
    const other = { ...botAsk, body: "[Make the promise](https://pinky-bot.vercel.app/pay?repo=o%2Fr&n=4)" };
    expect(wasAsked({ labels: ["awaiting-promise"], comments: [human, other] }, link)).toBe(false);
  });
});

describe("withSeededNote", () => {
  const readme = "# pinky-demo\nDemo repo for Pinky: promises against spam issues and PRs\n";

  it("adds a note saying the issues are seeded and keeps the README as it was", () => {
    const updated = withSeededNote(readme);
    expect(updated.startsWith(readme)).toBe(true);
    expect(updated).toMatch(/seeded/i);
  });

  it("adds it once however often the script runs", () => {
    const once = withSeededNote(readme);
    expect(withSeededNote(once)).toBe(once);
  });
});

describe("SEED_ISSUES", () => {
  it("is about ten issues with distinct titles and real bodies", () => {
    expect(SEED_ISSUES.length).toBeGreaterThanOrEqual(8);
    expect(SEED_ISSUES.length).toBeLessThanOrEqual(12);
    expect(new Set(SEED_ISSUES.map((i) => i.title.toLowerCase())).size).toBe(SEED_ISSUES.length);
    for (const { title, body } of SEED_ISSUES) {
      expect(title.length).toBeGreaterThan(10);
      expect(body.length).toBeGreaterThan(80);
    }
  });

  it("never carries a verdict command, which only counts in comments but would read as one", () => {
    for (const { body } of SEED_ISSUES) expect(body).not.toMatch(/^\s*\/(accept|spam)\b/m);
  });
});
