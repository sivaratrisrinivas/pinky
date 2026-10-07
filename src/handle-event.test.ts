import { describe, expect, it } from "vitest";
import {
  AWAITING_PROMISE_LABEL,
  BROKEN_LABEL,
  KEPT_LABEL,
  PROMISED_LABEL,
  handleEvent,
  type Chain,
  type Github,
  type Outcome,
  type PinkyEvent,
  type WebhookEvent,
  type Project,
  type PromiseRecord,
} from "./handle-event.js";

const APP_URL = "https://pinky-bot.vercel.app";
const REPO = { id: 1407786691, full_name: "sivaratrisrinivas/pinky-demo" };

const MAINTAINER = "maintainer";
const BOT = "pinky-bot[bot]";

function fakes(
  projects: Project[] = [{ repoId: REPO.id }],
  promises: Record<number, PromiseRecord> = {},
  closedIssues: number[] = []
) {
  const labels: { repo: string; number: number; label: string }[] = [];
  const removed: { repo: string; number: number; label: string }[] = [];
  const comments: { repo: string; number: number; body: string }[] = [];
  const settlements: { repoId: number; issueNumber: number; outcome: Outcome }[] = [];
  const github: Github = {
    async addLabel(repo, number, label) {
      labels.push({ repo, number, label });
    },
    async removeLabel(repo, number, label) {
      removed.push({ repo, number, label });
    },
    async comment(repo, number, body) {
      comments.push({ repo, number, body });
    },
    async hasWriteAccess(_repo, login) {
      return login === MAINTAINER;
    },
    async isOpen(_repo, number) {
      return !closedIssues.includes(number);
    },
  };
  const chain: Chain = {
    async readProject(repoId) {
      return projects.find((p) => p.repoId === repoId) ?? null;
    },
    async readPromise(_repoId, issueNumber) {
      return promises[issueNumber] ?? null;
    },
    async countPromises() {
      return null;
    },
    async settle(repoId, issueNumber, outcome) {
      settlements.push({ repoId, issueNumber, outcome });
      return `${outcome}Sig${issueNumber}`;
    },
  };
  return { github, chain, labels, removed, comments, settlements };
}

function commented(body: string, login = MAINTAINER, number = 7, type = "User"): PinkyEvent {
  return {
    name: "issue_comment",
    payload: {
      action: "created",
      repository: REPO,
      issue: { number },
      comment: { body, user: { login, type } },
    },
  } as unknown as PinkyEvent;
}

function closed(
  kind: "issues" | "pull_request",
  login = MAINTAINER,
  number = 7,
  merged = false
): PinkyEvent {
  const item = { number, ...(kind === "pull_request" ? { merged } : {}) };
  return {
    name: kind,
    payload: {
      action: "closed",
      repository: REPO,
      sender: { login, type: "User" },
      ...(kind === "issues" ? { issue: item } : { pull_request: item }),
    },
  } as unknown as PinkyEvent;
}

const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function opened(
  kind: "issues" | "pull_request",
  authorAssociation: string,
  number = 7
): WebhookEvent {
  const item = { number, author_association: authorAssociation };
  return {
    name: kind,
    payload: {
      action: "opened",
      repository: REPO,
      ...(kind === "issues" ? { issue: item } : { pull_request: item }),
    },
  } as unknown as WebhookEvent;
}

describe("handleEvent", () => {
  for (const kind of ["issues", "pull_request"] as const) {
    for (const association of ["NONE", "FIRST_TIMER", "FIRST_TIME_CONTRIBUTOR"]) {
      it(`labels and comments on a ${association} ${kind} opening`, async () => {
        const { github, chain, labels, comments } = fakes();

        await handleEvent(opened(kind, association), { github, chain, appUrl: APP_URL });

        expect(labels).toEqual([
          { repo: REPO.full_name, number: 7, label: AWAITING_PROMISE_LABEL },
        ]);
        expect(comments).toHaveLength(1);
        expect(comments[0]).toMatchObject({ repo: REPO.full_name, number: 7 });
      });
    }

    for (const association of ["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR"]) {
      it(`leaves a ${association} ${kind} opening alone`, async () => {
        const { github, chain, labels, comments } = fakes();

        await handleEvent(opened(kind, association), { github, chain, appUrl: APP_URL });

        expect(labels).toEqual([]);
        expect(comments).toEqual([]);
      });
    }
  }

  it("ignores a repo that isn't a project on-chain", async () => {
    const { github, chain, labels, comments } = fakes([]);

    await handleEvent(opened("issues", "NONE"), { github, chain, appUrl: APP_URL });

    expect(labels).toEqual([]);
    expect(comments).toEqual([]);
  });

  it("ignores actions other than opened", async () => {
    const { github, chain, labels, comments } = fakes();
    const event = opened("issues", "NONE");
    (event.payload as { action: string }).action = "edited";

    await handleEvent(event, { github, chain, appUrl: APP_URL });

    expect(labels).toEqual([]);
    expect(comments).toEqual([]);
  });

  it("puts the repo and the issue or PR number in the pay link", async () => {
    const { github, chain, comments } = fakes();

    await handleEvent(opened("pull_request", "NONE", 42), { github, chain, appUrl: APP_URL });

    const link = comments[0]!.body.match(/\]\((https:\/\/[^)]+)\)/)?.[1];
    const url = new URL(link!);
    expect(url.origin + url.pathname).toBe(`${APP_URL}/pay`);
    expect(url.searchParams.get("repo")).toBe(REPO.full_name);
    expect(url.searchParams.get("n")).toBe("42");
  });

  it("uses the agreed comment copy", async () => {
    const { github, chain, comments } = fakes();

    await handleEvent(opened("issues", "NONE"), { github, chain, appUrl: APP_URL });

    expect(comments[0]!.body).toMatch(
      /^Thanks for opening this! Pinky promise it isn't spam\? This project asks first-time contributors for a small refundable deposit of 5 USDC\. You get it back when this is closed, unless a maintainer marks it as spam\. \[Make the promise: 30 seconds, sign in with Google\]\(.+\) · Can't pay\? Anyone, like a contributor who knows you, can make the promise for you with the same link\.$/
    );
  });
});

describe("verdicts", () => {
  it("keeps an open promise on /accept from a maintainer", async () => {
    const { github, chain, comments, labels, settlements } = fakes(undefined, { 7: { state: "open" } });

    await handleEvent(commented("/accept"), { github, chain, appUrl: APP_URL });

    expect(settlements).toEqual([{ repoId: REPO.id, issueNumber: 7, outcome: "kept" }]);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toContain(explorer("keptSig7"));
    expect(labels).toEqual([{ repo: REPO.full_name, number: 7, label: KEPT_LABEL }]);
  });

  it("breaks an open promise on /spam and labels it promise-broken", async () => {
    const { github, chain, comments, labels, removed, settlements } = fakes(undefined, {
      7: { state: "open" },
    });

    await handleEvent(commented("/spam"), { github, chain, appUrl: APP_URL });

    expect(settlements).toEqual([{ repoId: REPO.id, issueNumber: 7, outcome: "broken" }]);
    expect(comments[0]!.body).toContain(explorer("brokenSig7"));
    expect(labels).toEqual([{ repo: REPO.full_name, number: 7, label: BROKEN_LABEL }]);
    expect(removed.map((r) => r.label).sort()).toEqual([AWAITING_PROMISE_LABEL, PROMISED_LABEL]);
  });

  it("finds a command on any line of a longer comment", async () => {
    const { github, chain, settlements } = fakes(undefined, { 7: { state: "open" } });

    await handleEvent(commented("Not a real change.\n/spam\nThanks"), { github, chain, appUrl: APP_URL });

    expect(settlements).toHaveLength(1);
  });

  for (const [kind, merged] of [["issues", false], ["pull_request", false], ["pull_request", true]] as const) {
    it(`keeps an open promise when a maintainer closes a ${kind}${merged ? " by merging" : ""}`, async () => {
      const { github, chain, comments, labels, settlements } = fakes(undefined, { 7: { state: "open" } });

      await handleEvent(closed(kind, MAINTAINER, 7, merged), { github, chain, appUrl: APP_URL });

      expect(settlements).toEqual([{ repoId: REPO.id, issueNumber: 7, outcome: "kept" }]);
      expect(comments[0]!.body).toContain(explorer("keptSig7"));
      expect(labels).toEqual([{ repo: REPO.full_name, number: 7, label: KEPT_LABEL }]);
    });
  }

  it("does not let the author close their way to a refund", async () => {
    const { github, chain, comments, settlements } = fakes(undefined, { 7: { state: "open" } });

    await handleEvent(closed("issues", "first-timer"), { github, chain, appUrl: APP_URL });

    expect(settlements).toEqual([]);
    expect(comments).toEqual([]);
  });

  for (const command of ["/accept", "/spam"]) {
    it(`replies to ${command} from someone without write access and settles nothing`, async () => {
      const { github, chain, comments, settlements, labels } = fakes(undefined, { 7: { state: "open" } });

      await handleEvent(commented(command, "first-timer"), { github, chain, appUrl: APP_URL });

      expect(settlements).toEqual([]);
      expect(labels).toEqual([]);
      expect(comments).toHaveLength(1);
      expect(comments[0]!.body).toContain("@first-timer");
      expect(comments[0]!.body).toContain("write access");
    });
  }

  for (const state of ["kept", "broken"] as const) {
    it(`says a verdict on a ${state} promise is too late and settles nothing`, async () => {
      const { github, chain, comments, settlements, labels } = fakes(undefined, {
        7: { state, settlementTx: "firstSig" },
      });

      await handleEvent(commented(state === "kept" ? "/spam" : "/accept"), { github, chain, appUrl: APP_URL });

      expect(settlements).toEqual([]);
      expect(labels).toEqual([]);
      expect(comments).toHaveLength(1);
      expect(comments[0]!.body).toBe(
        `This promise was already ${state} ([view transaction](${explorer("firstSig")})).`
      );
    });
  }

  it("stays quiet when a settled promise's issue is closed afterwards", async () => {
    const { github, chain, comments, settlements } = fakes(undefined, {
      7: { state: "broken", settlementTx: "firstSig" },
    });

    await handleEvent(closed("issues"), { github, chain, appUrl: APP_URL });

    expect(settlements).toEqual([]);
    expect(comments).toEqual([]);
  });

  it("only removes awaiting-promise from an issue with no promise", async () => {
    for (const event of [commented("/accept"), commented("/spam"), closed("issues"), closed("pull_request")]) {
      const { github, chain, comments, removed, labels, settlements } = fakes();

      await handleEvent(event, { github, chain, appUrl: APP_URL });

      expect(removed).toEqual([{ repo: REPO.full_name, number: 7, label: AWAITING_PROMISE_LABEL }]);
      expect(labels).toEqual([]);
      expect(comments).toEqual([]);
      expect(settlements).toEqual([]);
    }
  });

  it("ignores the App's own comments", async () => {
    const { github, chain, comments, settlements } = fakes(undefined, { 7: { state: "open" } });

    await handleEvent(commented("/spam", BOT, 7, "Bot"), { github, chain, appUrl: APP_URL });

    expect(settlements).toEqual([]);
    expect(comments).toEqual([]);
  });

  it("ignores comments that aren't verdict commands", async () => {
    for (const body of ["looks good", "please /accept this", "> /spam", "/acceptable", "/accepted", "/accept-all"]) {
      const { github, chain, comments, removed, settlements } = fakes(undefined, { 7: { state: "open" } });

      await handleEvent(commented(body), { github, chain, appUrl: APP_URL });

      expect({ body, settlements, comments, removed }).toEqual({ body, settlements: [], comments: [], removed: [] });
    }
  });

  it("ignores verdicts in a repo that isn't a project", async () => {
    const { github, chain, comments, settlements } = fakes([], { 7: { state: "open" } });

    await handleEvent(commented("/spam", "first-timer"), { github, chain, appUrl: APP_URL });
    await handleEvent(closed("issues"), { github, chain, appUrl: APP_URL });

    expect(settlements).toEqual([]);
    expect(comments).toEqual([]);
  });
});

function ping(number = 7, repo = REPO): PinkyEvent {
  return { name: "check_promise", repo: { id: repo.id, full_name: repo.full_name }, number };
}

describe("the pay page's check-promise ping", () => {
  it("swaps awaiting-promise for promised once the chain has the promise", async () => {
    const { github, chain, labels, removed, comments, settlements } = fakes(undefined, {
      7: { state: "open" },
    });

    await handleEvent(ping(), { github, chain, appUrl: APP_URL });

    expect(labels).toEqual([{ repo: REPO.full_name, number: 7, label: PROMISED_LABEL }]);
    expect(removed).toEqual([{ repo: REPO.full_name, number: 7, label: AWAITING_PROMISE_LABEL }]);
    expect(comments).toEqual([]);
    expect(settlements).toEqual([]);
  });

  it("changes nothing when the chain has no promise, however confident the ping is", async () => {
    const { github, chain, labels, removed, comments, settlements } = fakes();

    await handleEvent(ping(), { github, chain, appUrl: APP_URL });

    expect({ labels, removed, comments, settlements }).toEqual({
      labels: [],
      removed: [],
      comments: [],
      settlements: [],
    });
  });

  it("keeps the promise right away when the issue was already closed", async () => {
    const { github, chain, labels, removed, comments, settlements } = fakes(
      undefined,
      { 7: { state: "open" } },
      [7]
    );

    await handleEvent(ping(), { github, chain, appUrl: APP_URL });

    expect(settlements).toEqual([{ repoId: REPO.id, issueNumber: 7, outcome: "kept" }]);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.body).toContain(explorer("keptSig7"));
    expect(labels).toEqual([{ repo: REPO.full_name, number: 7, label: KEPT_LABEL }]);
    expect(removed.map((r) => r.label).sort()).toEqual([AWAITING_PROMISE_LABEL, PROMISED_LABEL]);
  });

  for (const state of ["kept", "broken"] as const) {
    it(`leaves a ${state} promise alone, closed issue or not`, async () => {
      for (const closedIssues of [[], [7]]) {
        const { github, chain, labels, removed, comments, settlements } = fakes(
          undefined,
          { 7: { state, settlementTx: "firstSig" } },
          closedIssues
        );

        await handleEvent(ping(), { github, chain, appUrl: APP_URL });

        expect({ labels, removed, comments, settlements }).toEqual({
          labels: [],
          removed: [],
          comments: [],
          settlements: [],
        });
      }
    });
  }

  it("ignores a ping for a repo that isn't a project", async () => {
    const { github, chain, labels, comments, settlements } = fakes([], { 7: { state: "open" } }, [7]);

    await handleEvent(ping(), { github, chain, appUrl: APP_URL });

    expect({ labels, comments, settlements }).toEqual({ labels: [], comments: [], settlements: [] });
  });

  it("is harmless when the same ping arrives twice", async () => {
    const { github, chain, comments, settlements } = fakes(undefined, { 7: { state: "open" } });

    await handleEvent(ping(), { github, chain, appUrl: APP_URL });
    await handleEvent(ping(), { github, chain, appUrl: APP_URL });

    expect(comments).toEqual([]);
    expect(settlements).toEqual([]);
  });
});
