import { describe, expect, it } from "vitest";
import {
  AWAITING_PROMISE_LABEL,
  handleEvent,
  type Chain,
  type Github,
  type PinkyEvent,
  type Project,
} from "./handle-event.js";

const APP_URL = "https://pinky-bot.vercel.app";
const REPO = { id: 1407786691, full_name: "sivaratrisrinivas/pinky-demo" };

function fakes(projects: Project[] = [{ repoId: REPO.id }]) {
  const labels: { repo: string; number: number; label: string }[] = [];
  const comments: { repo: string; number: number; body: string }[] = [];
  const github: Github = {
    async addLabel(repo, number, label) {
      labels.push({ repo, number, label });
    },
    async comment(repo, number, body) {
      comments.push({ repo, number, body });
    },
  };
  const chain: Chain = {
    async readProject(repoId) {
      return projects.find((p) => p.repoId === repoId) ?? null;
    },
  };
  return { github, chain, labels, comments };
}

function opened(
  kind: "issues" | "pull_request",
  authorAssociation: string,
  number = 7
): PinkyEvent {
  const item = { number, author_association: authorAssociation };
  return {
    name: kind,
    payload: {
      action: "opened",
      repository: REPO,
      ...(kind === "issues" ? { issue: item } : { pull_request: item }),
    },
  } as unknown as PinkyEvent;
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
    (event.payload as { action: string }).action = "closed";

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
      /^Thanks for opening this! Pinky promise it isn't spam\? This project asks first-time contributors for a small refundable deposit of 5 USDC\. You get it back when this is closed, unless a maintainer marks it as spam\. \[Make the promise: 30 seconds, email sign-in\]\(.+\) · Can't pay\? Anyone, like a contributor who knows you, can make the promise for you with the same link\.$/
    );
  });
});
