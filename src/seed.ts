import { AWAITING_PROMISE_LABEL } from "./handle-event.js";

export const TOKENS_ENV = "SEED_GITHUB_TOKENS";

export interface SeedIssue {
  title: string;
  body: string;
}

/** Splits a list of test-account tokens on commas and whitespace, dropping blanks and repeats. */
export function parseTokens(raw: string | undefined): string[] {
  const tokens = [...new Set((raw ?? "").split(/[\s,]+/).filter(Boolean))];
  if (tokens.length === 0) throw new Error(`Set ${TOKENS_ENV} to one or more test-account tokens, comma separated`);
  return tokens;
}

const SEEDED_NOTE = `## About the issues here

The first issues in this repo were seeded for the demo: a script (\`scripts/seed-issues.ts\` in the Pinky repo) opened them from test GitHub accounts so that the repo looks used and the bot has something to react to. They are not reports from real users.
`;

/** Appends the "these issues are seeded" note to a README, once. */
export function withSeededNote(readme: string): string {
  if (readme.includes(SEEDED_NOTE.split("\n")[0]!)) return readme;
  return `${readme.trimEnd()}\n\n${SEEDED_NOTE}`;
}

/** Realistic first-timer issues for the demo repo, about ten. */
export const SEED_ISSUES: SeedIssue[] = [
  {
    title: "Typo in the README install section",
    body: "In the install section the second step says `npm instal` instead of `npm install`. I copied it and got a confusing error before I noticed. A one-letter fix would save the next person the same trip.",
  },
  {
    title: "Dark mode: link colour is unreadable on the pay page",
    body: "With my browser set to dark mode, the links on the pay page turn dark blue on a near-black background and I can barely read them. Seen on Firefox 130 on Linux. Happy to send a screenshot if that helps.",
  },
  {
    title: "Question: which Node version do you support?",
    body: "I'd like to try the project locally but the README doesn't say which Node versions work. I'm on Node 18 right now. Is that fine, or do I need to upgrade first? If it's 20 or newer, a line in the README would help.",
  },
  {
    title: "Add a CONTRIBUTING.md with the test command",
    body: "I wanted to send a small fix but couldn't find how to run the tests. It turned out to be `npm test`, which I only found by reading package.json. A short CONTRIBUTING.md with that command and the branch naming you prefer would make it easier for newcomers.",
  },
  {
    title: "Error message after a failed payment is too vague",
    body: "When my wallet had no devnet SOL the pay page just said \"Something went wrong\". It took me a while to work out that I needed to use the faucet button first. Could the message say what failed, for example that the wallet has no funds for fees?",
  },
  {
    title: "Pay page layout breaks on a narrow phone screen",
    body: "On a 320px wide screen the Make the promise button runs off the right edge and I have to scroll sideways to tap it. Checked on an older iPhone SE in Safari. The rest of the page looks fine.",
  },
  {
    title: "Feature request: show the settlement transaction link on the issue page",
    body: "After a promise is kept it would be nice to see the explorer link right where the label changes, not only in a comment further down a long thread. Maybe the bot could edit its first comment with the result. Not urgent, just an idea from watching a few issues settle.",
  },
  {
    title: "Docs: explain what happens if I close my own issue",
    body: "I opened an issue by mistake and closed it myself. I wasn't sure what happens to my promise. The docs describe /accept and /spam but not this case. Could you add a short paragraph on who can settle a promise?",
  },
  {
    title: "Broken link to the glossary in the README",
    body: "The link to the glossary near the top of the README opens a 404 page for me. It looks like the path is missing the file extension. I think `GLOSSARY` should be `GLOSSARY.md`, but I haven't checked every link in the file.",
  },
  {
    title: "Link the demo issues back to the escrow program on the explorer",
    body: "It would help judges and new users if the README linked straight to the escrow program on Solana Explorer on devnet. I had to search for the program ID by hand. A single link under the \"Escrow program\" heading would do it.",
  },
];

export interface IssueState {
  labels: string[];
  comments: { body: string; /** GitHub account type: "Bot" for the App. */ userType: string }[];
}

/** Whether the App has labelled the issue and posted its pay link, which is what "asked" looks like from outside. */
export function wasAsked(state: IssueState, payLink: string): boolean {
  return (
    state.labels.includes(AWAITING_PROMISE_LABEL) &&
    state.comments.some((c) => c.userType === "Bot" && c.body.includes(`(${payLink})`))
  );
}

export interface PlannedIssue {
  issue: SeedIssue;
  /** Index of the test account that opens it. */
  account: number;
}

const normalise = (title: string) => title.trim().toLowerCase();

/**
 * Decides which seed issues to open and from which test account.
 * The account follows the issue's position in the full list, so a re-run
 * gives each remaining issue the same author it would have had the first time.
 */
export function planSeed(seeds: SeedIssue[], accountCount: number, existingTitles: string[]): PlannedIssue[] {
  if (accountCount < 1) throw new Error("Need at least one test account token to seed issues");
  const existing = new Set(existingTitles.map(normalise));
  return seeds
    .map((issue, index) => ({ issue, account: index % accountCount }))
    .filter(({ issue }) => !existing.has(normalise(issue.title)));
}
