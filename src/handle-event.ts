import type { IssueCommentEvent, IssuesEvent, PullRequestEvent } from "@octokit/webhooks-types";

export const AWAITING_PROMISE_LABEL = "awaiting-promise";
export const PROMISED_LABEL = "promised";
export const KEPT_LABEL = "promise-kept";
export const BROKEN_LABEL = "promise-broken";

export const FIRST_TIMER_ASSOCIATIONS = new Set(["NONE", "FIRST_TIMER", "FIRST_TIME_CONTRIBUTOR"]);

export interface Github {
  addLabel(repo: string, number: number, label: string): Promise<void>;
  /** Removes a label, doing nothing when the issue doesn't have it. */
  removeLabel(repo: string, number: number, label: string): Promise<void>;
  comment(repo: string, number: number, body: string): Promise<void>;
  /** Whether the user can push to the repo, which is what makes them a maintainer. */
  hasWriteAccess(repo: string, login: string): Promise<boolean>;
  /** Whether the issue or PR is still open. */
  isOpen(repo: string, number: number): Promise<boolean>;
}

export interface Project {
  repoId: number;
}

export type Outcome = "kept" | "broken";

export type PromiseRecord =
  | { state: "open" }
  | { state: Outcome; /** Transaction that settled it, null when it can't be found. */ settlementTx: string | null };

export interface Chain {
  /** The project for a GitHub repo ID, or null when the repo isn't one of ours. */
  readProject(repoId: number): Promise<Project | null>;
  /** The promise for an issue or PR, or null when nobody has made one. */
  readPromise(repoId: number, issueNumber: number): Promise<PromiseRecord | null>;
  /** Settles an open promise with the arbiter key and returns the transaction signature. */
  settle(repoId: number, issueNumber: number, outcome: Outcome): Promise<string>;
}

export interface Ports {
  github: Github;
  chain: Chain;
  /** Origin of the pay page, no trailing slash. */
  appUrl: string;
}

export type WebhookEvent =
  | { name: "issues"; payload: IssuesEvent }
  | { name: "pull_request"; payload: PullRequestEvent }
  | { name: "issue_comment"; payload: IssueCommentEvent };

export type PinkyEvent =
  | WebhookEvent
  /** The pay page's ping after a deposit. It carries no proof: the chain is the only authority. */
  | { name: "check_promise"; repo: { id: number; full_name: string }; number: number };

const VERDICT_COMMANDS: Record<string, Outcome> = { accept: "kept", spam: "broken" };

export async function handleEvent(event: PinkyEvent, ports: Ports): Promise<void> {
  if (event.name === "check_promise") return checkPromise(event, ports);
  if (event.name === "issue_comment") return handleComment(event.payload, ports);
  if (event.payload.action === "opened") return askForPromise(event, ports);
  if (event.payload.action === "closed") {
    const item = event.name === "issues" ? event.payload.issue : event.payload.pull_request;
    return settleVerdict(
      { repo: event.payload.repository, number: item.number, login: event.payload.sender.login, outcome: "kept", fromCommand: false },
      ports
    );
  }
}

async function askForPromise(
  event: Extract<PinkyEvent, { name: "issues" | "pull_request" }>,
  ports: Ports
): Promise<void> {
  const item = event.name === "issues" ? event.payload.issue : event.payload.pull_request;
  if (!FIRST_TIMER_ASSOCIATIONS.has(item.author_association)) return;

  const repo = event.payload.repository;
  if (!(await ports.chain.readProject(repo.id))) return;

  await ports.github.addLabel(repo.full_name, item.number, AWAITING_PROMISE_LABEL);
  await ports.github.comment(
    repo.full_name,
    item.number,
    promiseAsk(payLink(ports.appUrl, repo.full_name, item.number))
  );
}

async function handleComment(payload: IssueCommentEvent, ports: Ports): Promise<void> {
  if (payload.action !== "created" || payload.comment.user.type === "Bot") return;

  const command = payload.comment.body.match(/^\s*\/(accept|spam)(?![\w-])/m)?.[1];
  if (!command) return;

  await settleVerdict(
    {
      repo: payload.repository,
      number: payload.issue.number,
      login: payload.comment.user.login,
      outcome: VERDICT_COMMANDS[command]!,
      fromCommand: true,
    },
    ports
  );
}

async function checkPromise(
  event: Extract<PinkyEvent, { name: "check_promise" }>,
  ports: Ports
): Promise<void> {
  const { repo, number } = event;
  const { github, chain } = ports;

  if (!(await chain.readProject(repo.id))) return;

  const promise = await chain.readPromise(repo.id, number);
  // A settled promise has its final label already; a ping must not undo it.
  if (promise?.state !== "open") return;

  // The deposit landed after the issue was closed: nobody is left to give a verdict, so keep it now.
  if (!(await github.isOpen(repo.full_name, number))) {
    return settleOpenPromise(repo, number, "kept", ports);
  }

  await github.removeLabel(repo.full_name, number, AWAITING_PROMISE_LABEL);
  await github.addLabel(repo.full_name, number, PROMISED_LABEL);
}

interface VerdictRequest {
  repo: { id: number; full_name: string };
  number: number;
  login: string;
  outcome: Outcome;
  /** A command gets replies for refusals. A plain close stays quiet unless it settles something. */
  fromCommand: boolean;
}

async function settleVerdict(request: VerdictRequest, ports: Ports): Promise<void> {
  const { repo, number, login, outcome, fromCommand } = request;
  const { github, chain } = ports;

  if (!(await chain.readProject(repo.id))) return;

  if (!(await github.hasWriteAccess(repo.full_name, login))) {
    if (fromCommand) {
      await github.comment(
        repo.full_name,
        number,
        `Sorry @${login}, only people with write access to this repo can settle a promise.`
      );
    }
    return;
  }

  const promise = await chain.readPromise(repo.id, number);
  if (!promise) {
    await github.removeLabel(repo.full_name, number, AWAITING_PROMISE_LABEL);
    return;
  }

  if (promise.state !== "open") {
    if (fromCommand) {
      await github.comment(
        repo.full_name,
        number,
        `This promise was already ${promise.state}${transactionLink(promise.settlementTx, " (", ")")}.`
      );
    }
    return;
  }

  await settleOpenPromise(repo, number, outcome, ports);
}

async function settleOpenPromise(
  repo: { id: number; full_name: string },
  number: number,
  outcome: Outcome,
  { github, chain }: Ports
): Promise<void> {
  const signature = await chain.settle(repo.id, number, outcome);
  await github.comment(repo.full_name, number, settlementNotice(outcome, signature));
  await github.removeLabel(repo.full_name, number, AWAITING_PROMISE_LABEL);
  await github.removeLabel(repo.full_name, number, PROMISED_LABEL);
  await github.addLabel(repo.full_name, number, outcome === "kept" ? KEPT_LABEL : BROKEN_LABEL);
}

function transactionLink(signature: string | null, before: string, after: string): string {
  if (!signature) return "";
  return `${before}[view transaction](https://explorer.solana.com/tx/${signature}?cluster=devnet)${after}`;
}

function settlementNotice(outcome: Outcome, signature: string): string {
  return outcome === "kept"
    ? `Promise kept, thanks for the contribution. It went back to whoever made it.${transactionLink(signature, " ", "")}`
    : `Promise broken. It went to the maintainer wallet.${transactionLink(signature, " ", "")}`;
}

export function payLink(appUrl: string, repo: string, number: number): string {
  const query = new URLSearchParams({ repo, n: String(number) });
  return `${appUrl}/pay?${query}`;
}

function promiseAsk(link: string): string {
  return `Thanks for opening this! Pinky promise it isn't spam? This project asks first-time contributors for a small refundable deposit of 5 USDC. You get it back when this is closed, unless a maintainer marks it as spam. [Make the promise: 30 seconds, sign in with Google](${link}) · Can't pay? Anyone, like a contributor who knows you, can make the promise for you with the same link.`;
}
