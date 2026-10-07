// Opens about 10 realistic issues on the demo repo from test GitHub accounts, so the repo looks used.
// Usage: npm run seed-issues -- [owner/repo] [--dry-run]
// Env (run with --env-file=.env):
//   SEED_GITHUB_TOKENS  tokens of the test accounts, comma separated. Each needs the `public_repo` scope
//                       and must not be the repo owner or a collaborator, or the App won't treat it as a first-timer.
//   DEMO_REPO, APP_URL  from .env, written by scripts/setup-github-app.sh
//   SEED_OWNER_TOKEN    optional, a token with write access (for example `gh auth token`). With it the script
//                       also adds the "issues are seeded" note to the demo repo's README.
// Safe to re-run: issues whose title already exists in the repo are skipped.
import { Octokit } from "octokit";
import { payLink } from "../src/handle-event.js";
import { isFirstTimer, parseTokens, planSeed, SEED_ISSUES, TOKENS_ENV, wasAsked, withSeededNote } from "../src/seed.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const repo = args.find((a) => !a.startsWith("--")) ?? process.env.DEMO_REPO;
if (!repo || !repo.includes("/")) throw new Error("Usage: seed-issues [owner/repo] [--dry-run] (or set DEMO_REPO)");
const [owner, name] = repo.split("/") as [string, string];
const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
if (!appUrl) throw new Error("Missing env var APP_URL");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const accounts = parseTokens(process.env[TOKENS_ENV]).map((token) => new Octokit({ auth: token }));
const logins = await Promise.all(accounts.map(async (a) => (await a.rest.users.getAuthenticated()).data.login));
console.log(`${logins.length} test account(s): ${logins.join(", ")}`);

const existing = await accounts[0]!.paginate(accounts[0]!.rest.issues.listForRepo, {
  owner,
  repo: name,
  state: "all",
  per_page: 100,
});
const plan = planSeed(SEED_ISSUES, accounts.length, existing.map((i) => i.title));
console.log(`${plan.length} of ${SEED_ISSUES.length} issues to open on ${repo}${dryRun ? " (dry run)" : ""}`);

const opened: number[] = [];
for (const { issue, account } of plan) {
  if (dryRun) {
    console.log(`  would open as ${logins[account]}: ${issue.title}`);
    continue;
  }
  const { data } = await accounts[account]!.rest.issues.create({ owner, repo: name, title: issue.title, body: issue.body });
  const association = data.author_association ?? "unknown";
  const note = isFirstTimer(association) ? "" : ` (association ${association}: the App will ignore it)`;
  console.log(`  #${data.number} as ${logins[account]}: ${issue.title}${note}`);
  opened.push(data.number);
  await sleep(3000); // stay clear of GitHub's secondary rate limit on content creation
}

// The webhook answers within seconds; give it a minute before calling an issue unanswered.
const unanswered = new Set(opened);
for (let attempt = 0; attempt < 12 && unanswered.size > 0; attempt++) {
  await sleep(5000);
  for (const number of [...unanswered]) {
    const [{ data: issue }, comments] = await Promise.all([
      accounts[0]!.rest.issues.get({ owner, repo: name, issue_number: number }),
      accounts[0]!.paginate(accounts[0]!.rest.issues.listComments, { owner, repo: name, issue_number: number }),
    ]);
    const state = {
      labels: issue.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))),
      comments: comments.map((c) => ({ body: c.body ?? "", userType: c.user?.type ?? "" })),
    };
    if (wasAsked(state, payLink(appUrl, repo, number))) unanswered.delete(number);
  }
}
if (opened.length > 0) {
  console.log(`${opened.length - unanswered.size} of ${opened.length} got the label and the bot comment`);
  for (const number of unanswered) console.log(`  not asked yet: https://github.com/${repo}/issues/${number}`);
}

const ownerToken = process.env.SEED_OWNER_TOKEN;
if (ownerToken && !dryRun) {
  const ownerOctokit = new Octokit({ auth: ownerToken });
  const { data: file } = await ownerOctokit.rest.repos.getReadme({ owner, repo: name });
  const current = Buffer.from(file.content, "base64").toString("utf8");
  const updated = withSeededNote(current);
  if (updated === current) {
    console.log("README already says the issues are seeded");
  } else {
    await ownerOctokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo: name,
      path: file.path,
      sha: file.sha,
      message: "Say that the demo issues are seeded",
      content: Buffer.from(updated).toString("base64"),
    });
    console.log("README now says the issues are seeded");
  }
} else if (!dryRun) {
  console.log(`Set SEED_OWNER_TOKEN to add the "issues are seeded" note to ${repo}'s README, or add it by hand.`);
}

process.exitCode = unanswered.size > 0 ? 1 : 0;
