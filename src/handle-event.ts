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

/** The part of a GitHub repository this code needs: its ID (what the chain keys on) and `owner/name`. */
export interface RepoRef {
  id: number;
  full_name: string;
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
  /** Every promise of a project, open ones included, and how many are broken. Null when the repo isn't one of ours. */
  countPromises(repoId: number): Promise<{ promises: number; broken: number } | null>;
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
  /** The pay page's ping after a promise. It carries no proof: the chain is the only authority. */
  | { name: "check_promise"; repo: RepoRef; number: number };

const VERDICT_COMMANDS: Record<string, Outcome> = { accept: "kept", spam: "broken" };

export async function handleEvent(event: PinkyEvent, ports: Ports): Promise<void> {
  if (event.name === "check_promise") {
    await checkPromise(event, ports);
    return;
  }
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

/**
 * Looks at the chain for the promise a pay-page ping is about. "found" means the chain has it, so the ping did
 * its job; "not-found" means it doesn't yet, which the page may retry when the RPC read lags behind the transaction.
 */
export async function checkPromise(
  event: { repo: RepoRef; number: number },
  ports: Ports
): Promise<"found" | "not-found"> {
  const { repo, number } = event;
  const { github, chain } = ports;

  if (!(await chain.readProject(repo.id))) return "not-found";

  const promise = await chain.readPromise(repo.id, number);
  if (!promise) return "not-found";
  // A settled promise has its final label already; a ping must not undo it.
  if (promise.state !== "open") return "found";

  // The promise landed after the issue was closed: nobody is left to give a verdict, so keep it now.
  if (!(await github.isOpen(repo.full_name, number))) {
    await settleOpenPromise(repo, number, "kept", ports);
    return "found";
  }

  await github.removeLabel(repo.full_name, number, AWAITING_PROMISE_LABEL);
  await github.addLabel(repo.full_name, number, PROMISED_LABEL);
  return "found";
}

interface VerdictRequest {
  repo: RepoRef;
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

  const earlier = promise.state === "open" ? await settleOpenPromise(repo, number, outcome, ports) : promise;
  if (earlier && fromCommand) {
    await github.comment(
      repo.full_name,
      number,
      `This promise was already ${earlier.state}${transactionLink(earlier.settlementTx, " (", ")")}.`
    );
  }
}

type SettledPromise = Exclude<PromiseRecord, { state: "open" }>;

/**
 * Settles an open promise and updates the issue. When another verdict got there first, settle fails on-chain
 * with `PromiseSettled`; this then returns that earlier verdict and leaves the issue to its handler.
 */
async function settleOpenPromise(
  repo: RepoRef,
  number: number,
  outcome: Outcome,
  { github, chain }: Ports
): Promise<SettledPromise | null> {
  let signature: string;
  try {
    signature = await chain.settle(repo.id, number, outcome);
  } catch (error) {
    const now = await chain.readPromise(repo.id, number);
    if (now && now.state !== "open") return now;
    throw error;
  }
  await github.comment(repo.full_name, number, settlementNotice(outcome, signature));
  await github.removeLabel(repo.full_name, number, AWAITING_PROMISE_LABEL);
  await github.removeLabel(repo.full_name, number, PROMISED_LABEL);
  await github.addLabel(repo.full_name, number, outcome === "kept" ? KEPT_LABEL : BROKEN_LABEL);
  return null;
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
  return `Thanks for opening this! Pinky promise it isn't spam? This project asks first-time contributors for a small promise of 5 USDC. It's kept, and the money goes back to whoever made it, when this is closed, unless a maintainer marks it as spam. [Make the promise: 30 seconds, sign in with Google](${link}) · Can't pay? Anyone, like a contributor who knows you, can make the promise for you with the same link.`;
}
