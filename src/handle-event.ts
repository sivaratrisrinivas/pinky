import type { IssuesEvent, PullRequestEvent } from "@octokit/webhooks-types";

export const AWAITING_PROMISE_LABEL = "awaiting-promise";

const FIRST_TIMER_ASSOCIATIONS = new Set(["NONE", "FIRST_TIMER", "FIRST_TIME_CONTRIBUTOR"]);

export interface Github {
  addLabel(repo: string, number: number, label: string): Promise<void>;
  comment(repo: string, number: number, body: string): Promise<void>;
}

export interface Project {
  repoId: number;
}

export interface Chain {
  /** The project for a GitHub repo ID, or null when the repo isn't one of ours. */
  readProject(repoId: number): Promise<Project | null>;
}

export interface Ports {
  github: Github;
  chain: Chain;
  /** Origin of the pay page, no trailing slash. */
  appUrl: string;
}

export type PinkyEvent =
  | { name: "issues"; payload: IssuesEvent }
  | { name: "pull_request"; payload: PullRequestEvent };

export async function handleEvent(event: PinkyEvent, ports: Ports): Promise<void> {
  if (event.payload.action !== "opened") return;

  const item = event.name === "issues" ? event.payload.issue : event.payload.pull_request;
  if (!FIRST_TIMER_ASSOCIATIONS.has(item.author_association)) return;

  const repo = event.payload.repository;
  if (!(await ports.chain.readProject(repo.id))) return;

  await ports.github.addLabel(repo.full_name, item.number, AWAITING_PROMISE_LABEL);
  await ports.github.comment(
    repo.full_name,
    item.number,
    askForPromise(payLink(ports.appUrl, repo.full_name, item.number))
  );
}

function payLink(appUrl: string, repo: string, number: number): string {
  const query = new URLSearchParams({ repo, n: String(number) });
  return `${appUrl}/pay?${query}`;
}

function askForPromise(link: string): string {
  return `Thanks for opening this! Pinky promise it isn't spam? This project asks first-time contributors for a small refundable deposit of 5 USDC. You get it back when this is closed, unless a maintainer marks it as spam. [Make the promise: 30 seconds, email sign-in](${link}) · Can't pay? Anyone, like a contributor who knows you, can make the promise for you with the same link.`;
}
