# Pinky

Pinky promise this isn't spam.

Pinky asks first-time contributors to a GitHub repo for a small refundable deposit before a maintainer looks at their issue or PR. It keeps maintainers' time for people willing to stake something on not being spam. The money sits in a Solana escrow program until a maintainer gives a verdict.

Built for a hackathon on **Solana devnet** with a test USDC mint. Not for real money.

## How it works

1. A first-timer opens an issue or PR on a project. The Pinky GitHub App labels it `awaiting-promise` and comments a friendly pay link.
2. They sign in on the pay page with a Google account (Phantom Connect has no bare-email option yet; see Known limits), get test USDC and make a 5 USDC **promise**. The label flips to `promised`.
3. A maintainer closes the issue or comments `/accept`, and the promise is **kept**: the money goes back to whoever paid. If the maintainer comments `/spam`, the promise is **broken** and the money goes to the project's maintainer wallet.
4. The bot comments the transaction link either way.

Anyone can make a promise for a first-timer by paying their link, which is how existing contributors vouch for newcomers (ADR 0002).

The vocabulary (project, maintainer, first-timer, promiser, promise, kept, broken, verdict, maintainer wallet, arbiter) is defined in [GLOSSARY.md](GLOSSARY.md).

## Trust model

In v1 the GitHub App holds one **arbiter** keypair and signs every verdict for a maintainer who comments a command or closes the issue ([ADR 0001](docs/adr/0001-app-holds-the-arbiter-key.md)). A leaked key could settle any open promise, but the program only lets the arbiter pick the outcome:

- a kept promise is paid only to the token account that paid the promise
- a broken promise is paid only to the project's maintainer wallet
- a settled promise can't be settled again

Both destinations are read from stored accounts, never from the caller. In v2 the maintainer's own wallet signs.

## Status

| Piece | State |
| --- | --- |
| Escrow program on devnet (`escrow/`) | Done ([#2](https://github.com/sivaratrisrinivas/pinky/issues/2)) |
| Demo repo, GitHub App, keys, deploy secrets (`scripts/setup-github-app.sh`) | Done ([#3](https://github.com/sivaratrisrinivas/pinky/issues/3)) |
| Ask first-timers for a promise (`handleEvent`, webhook) | Done, live at https://pinky-bot.vercel.app ([#4](https://github.com/sivaratrisrinivas/pinky/issues/4)) |
| Verdicts from maintainer commands and closes (`handleEvent`, real Solana adapter) | Done. `/spam`, `/accept`, an issue close and the already-settled reply ran live on devnet ([#5](https://github.com/sivaratrisrinivas/pinky/issues/5)) |
| Pay page with Google sign-in and faucet | Live at `/pay` with the Phantom extension and verified on devnet. Email sign-in is the one open gap: Google sign-in is built but needs `PHANTOM_APP_ID` ([#6](https://github.com/sivaratrisrinivas/pinky/issues/6)) |
| Pay page pings the app so the label flips | Built and tested with fakes; `/api/check-promise` not deployed or run live yet, so the demo-repo criterion of [#7](https://github.com/sivaratrisrinivas/pinky/issues/7) is still open |
| README badge, seed data, full-journey runs | Not started ([#8](https://github.com/sivaratrisrinivas/pinky/issues/8), [#9](https://github.com/sivaratrisrinivas/pinky/issues/9), [#11](https://github.com/sivaratrisrinivas/pinky/issues/11)) |

The spec is [#1](https://github.com/sivaratrisrinivas/pinky/issues/1) and the day-by-day plan is in [PLAN.md](PLAN.md).

## Repo layout

```
escrow/                  Anchor program, tests and operator scripts
  programs/escrow/       init_project, deposit, refund, forfeit
  tests/                 behaviour tests on a local validator
  scripts/               setup-project, smoke and promise, run against devnet
api/webhook.ts           Vercel function: verifies the GitHub webhook and calls handleEvent
api/pay.ts, faucet.ts, deposit-tx.ts, check-promise.ts   Vercel functions behind the pay page
web/pay.ts               pay page client, bundled by `npm run build` into public/pay.js
public/pay.html          the pay page, served at /pay (see vercel.json)
.vercelignore            keeps escrow/, scripts/ and docs/ out of deploys
src/                     handleEvent and its GitHub and chain ports, plus the real adapters
scripts/                 setup-github-app.sh, the human-only setup wizard
docs/adr/                architecture decisions
docs/agents/             issue tracker, triage labels and domain doc conventions
GLOSSARY.md              the project's vocabulary
PLAN.md                  build plan to Oct 12
```

## Escrow program

Program ID `2nAVrgq7xYseUPES5ZUxfQ2pKcyWkiRJNxbgAWca7FCU`, deployed on devnet. Instructions:

| Instruction | Signer | Effect |
| --- | --- | --- |
| `init_project(repo_id, amount, arbiter)` | operator | Creates the project for a GitHub repo ID and its token vault. Stores the arbiter, mint, maintainer wallet and promise amount. |
| `deposit(issue_number)` | promiser | Creates the promise for one issue or PR number and moves the amount into the vault. Fails if one already exists. |
| `refund` | arbiter | Keeps the promise: vault to the promiser's token account. |
| `forfeit` | arbiter | Breaks the promise: vault to the maintainer wallet. |

Accounts are program-derived addresses: project from `["project", repo_id]`, promise from `["promise", project, issue_number]`, vault from `["vault", project]` (owned by the project). Settled promises stay on-chain as `Kept` or `Broken`, so the app can read them later for "already settled" replies and badge counts.

Known limits in v1:

- `init_project` is permissionless, so anyone could create a project for a repo ID first. The app should check a project's arbiter and maintainer wallet before trusting it.
- A refund fails for good if the promiser closes their token account after depositing. The promise can then only be broken.

### Develop

Needs Rust, the Solana CLI, Anchor 1.2 and Node. Anchor 1.2 defaults to surfpool for tests, so `npm test` selects `solana-test-validator` with `ANCHOR_TEST_VALIDATOR=legacy`.

```bash
cd escrow
npm install
npm test          # builds, then runs the tests on a local validator
npm run typecheck
```

The tests call the instructions the way a client would and check balances and promise state: deposit then refund, deposit then forfeit, duplicate deposits, double settlement, non-arbiter signers, vouching, redirected destinations and cross-project substitution.

### Deploy and run on devnet

```bash
cd escrow
anchor deploy --provider.cluster devnet     # needs about 3 devnet SOL
npm run setup-project -- <owner>/<repo>     # test USDC mint, arbiter key and project; safe to re-run
npm run smoke                               # keep and break on devnet, prints two explorer links
npm run promise -- <issue-number>           # a 5 test USDC promise for a real demo issue, to settle from GitHub
```

Keys and the generated `devnet.json` live in `escrow/.keys/` and are gitignored. The wizard `scripts/setup-github-app.sh` creates the demo repo, GitHub App, arbiter and faucet keypairs and `.env` first; `setup-project` reuses its arbiter.

The demo project is `sivaratrisrinivas/pinky-demo` (repo ID 1407786691) with the test USDC mint `BATkjUKVJzLi3YNT7wKvmA6Eh3rkN9wuCpgCNnzL9Wn3`.

## GitHub App

The bot runs as one Vercel function at `https://pinky-bot.vercel.app/api/webhook`. GitHub sends it `issues`, `pull_request` and `issue_comment` events.

For each request the function:

1. Checks the `X-Hub-Signature-256` header against `GITHUB_WEBHOOK_SECRET`. A bad or missing signature gets a 401.
2. Ignores every event except `issues`, `pull_request` and `issue_comment`.
3. Calls `handleEvent`.

`handleEvent` does one of two things, and only for repos that are projects on-chain:

**Ask.** On `issues.opened` or `pull_request.opened` by a first-timer (`NONE`, `FIRST_TIMER` or `FIRST_TIME_CONTRIBUTOR`) it adds the `awaiting-promise` label and posts the comment, with a pay link of the form `https://pinky-bot.vercel.app/pay?repo=<owner>%2F<name>&n=<number>`.

**Settle.** A verdict is `/accept` or `/spam` on a line of its own in a new comment, or closing an issue or closing or merging a PR. Comments from bots are ignored, which covers the App's own. Then:

| Situation | Result |
| --- | --- |
| Sender has no write access, by command | A short reply, no chain call. |
| Sender has no write access, by close | Nothing. The author closing their own issue is not a verdict. |
| Open promise | `/accept` or a close keeps it, `/spam` breaks it. The bot comments the explorer link, removes `awaiting-promise` and `promised`, and adds `promise-kept` or `promise-broken`. |
| Settled promise, by command | "This promise was already kept/broken" with the original transaction link. No chain call. The first verdict is final. |
| Settled promise, by close | Nothing. Closing after `/spam` is normal. |
| No promise | Only `awaiting-promise` is removed. |

`handleEvent` in `src/handle-event.ts` is the only entry point. It reaches the outside world through two ports, and the tests use in-memory fakes of both.

| Port | Methods today | Real adapter |
| --- | --- | --- |
| `Github` | `addLabel`, `removeLabel`, `comment`, `hasWriteAccess` | `src/github.ts`, Octokit with an installation token. `hasWriteAccess` is the collaborator permission being `write` or `admin`. |
| `Chain` | `readProject`, `readPromise`, `settle` | `src/chain.ts`, decodes accounts over RPC and signs `refund` or `forfeit` with the arbiter key |

`readProject` returns null when the project account doesn't exist, isn't a `Project` account, or names a different arbiter than ours. The last check matters because `init_project` is permissionless. Author association comes from the webhook payload, not from an extra API call. `readPromise` returns null, `open`, or `kept`/`broken` with the latest successful transaction on the promise account, which is the settlement. `settle` rebuilds the instruction from the stored accounts, so the destination is always the promiser's token account for kept and the maintainer wallet for broken. Counting promises joins the `Chain` port in [#8](https://github.com/sivaratrisrinivas/pinky/issues/8).

```bash
npm install
npm test          # 75 tests: handleEvent, the chain adapter, signature check, the pay page core
npm run typecheck
```

### Deploy

```bash
vercel deploy --prod --yes     # from the repo root
```

Things that broke the first deploy:

- Deployment Protection (Vercel Authentication) must be off, or GitHub gets a login page instead of the function.
- `.vercelignore` excludes `escrow/`, `scripts/` and `docs/`. A local test validator leaves a socket file in `escrow/.anchor/` that the Vercel CLI can't upload.
- `package.json` pins `uuid` to 9.x through `overrides`. `@solana/web3.js` 1.x pulls an ESM-only `uuid` that crashes `require()` on cold start.

Environment variables on the Vercel project: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET` and `ARBITER_SECRET_KEY`. The pay link host comes from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`. `RPC_URL` is optional and defaults to the public devnet endpoint.

### Verified live

On 2026-10-08, with the App installed on `sivaratrisrinivas/pinky-demo`:

- [Issue 1](https://github.com/sivaratrisrinivas/pinky-demo/issues/1), opened by the owner account, got no label and no comment.
- [Issue 2](https://github.com/sivaratrisrinivas/pinky-demo/issues/2), opened by a second account with association `NONE`, got `awaiting-promise` and the comment within seconds.
- `readProject` against the real devnet project for repo ID 1407786691 returns the project for the matching arbiter and null for any other.
- [Issue 4](https://github.com/sivaratrisrinivas/pinky-demo/issues/4) had a promise made with `npm run promise -- 4`. The owner's `/spam` comment got the bot reply "Promise broken" with [this `forfeit` transaction](https://explorer.solana.com/tx/7SwW41UUic7s5yq6Wuk5Fpo9e4bUuwbvRzBj9XSjVFtabCjgoFipx68pdmvANfbrWY45hXGKJCBV5cqZpU7Lawp?cluster=devnet) and the `promise-broken` label. `/accept` and closes were covered by tests only at that point.

Later the same day:

- [Issue 5](https://github.com/sivaratrisrinivas/pinky-demo/issues/5): a promise, then the owner's `/accept`. The bot replied "Promise kept" with [the `refund` transaction](https://explorer.solana.com/tx/2an11UeAoB3TGefTGFcSCSKqfjMSVPjG8L45PPidLZAJCYNqEWGcW4yxjwRiBTtH25ASt3i7fd6hjYRogwr778mV?cluster=devnet) and the `promise-kept` label. A `/spam` after that got "This promise was already kept" with the same link, and the label stayed.
- [Issue 6](https://github.com/sivaratrisrinivas/pinky-demo/issues/6): a promise, then the owner closed the issue. Same "Promise kept" reply and label.
- Both promisers' token accounts read 5 test USDC after the refund.
- [Issue 7](https://github.com/sivaratrisrinivas/pinky-demo/issues/7): a promise, then `/accept` from a second account without write access. The bot replied that only people with write access can settle a promise. No label was added, the issue stayed open, the promise state stayed open and the promiser's token account stayed at 0.
- [PR 8](https://github.com/sivaratrisrinivas/pinky-demo/pull/8): a promise, then the owner merged the PR. The bot replied "Promise kept" with [the `refund` transaction](https://explorer.solana.com/tx/5sKj7KHbdnWrjt7dy22gAqTQti86jepGcDCkwvd9qPdC82JZ1yyytTTA2ytoWTNxv5jMVip6boitKpCnELfFaR3o?cluster=devnet), added `promise-kept`, and the promiser's token account read 5 test USDC.

Every acceptance criterion of #5 has now run live. Closing a PR without merging was not run separately, but it takes the same path as a merge.

### Known limits

- A webhook retry after a failed comment can post the comment twice. Nothing checks for an existing label first.
- Two verdicts racing, such as `/accept` and a close seconds apart, can both read the promise as open. The second chain call fails with `PromiseSettled`, the webhook returns an error, and GitHub shows a failed delivery. The money is safe.
- The settlement link comes from `getSignaturesForAddress` on the public RPC, which only looks back 10 transactions on the promise account. A settled promise whose history the RPC can't serve gets the "already kept" reply without a link.
- The comment says "5 USDC" as fixed text. The amount is on the project account, and the `Project` type doesn't carry it yet.

## Pay page

`/pay?repo=<owner>/<name>&n=<number>` is where the bot's link lands. The page shows the issue and the amount, then: sign in, **Get test USDC**, **Make the promise**, and a Solana Explorer link.

| Function | What it does |
| --- | --- |
| `GET /api/pay` | Status of the link: `ready`, `closed`, `promised`, `unknown-issue` or `not-a-project`. The page shows no pay button unless it is `ready`. |
| `POST /api/faucet` | Tops a wallet up to 5 test USDC and 0.01 devnet SOL from the faucet wallet, creating its token account. Asking again sends nothing. |
| `POST /api/check-promise` | The ping after a deposit, with `{ repo, n }`. It carries no proof and the app never trusts it (see below). |
| `POST /api/deposit-tx` | Re-checks the status and returns an unsigned `deposit` transaction paid by the wallet. The browser signs it with the embedded wallet and sends it to devnet. |

### The ping

After the deposit confirms, the page posts `{ repo, n }` to `/api/check-promise`, and does the same when it opens on an issue that already has a promise, in case the first ping was lost. The function looks up the repo ID and installation through GitHub and calls `handleEvent` with a `check_promise` event. `handleEvent` reads the project and the promise from the chain and acts only on what it finds:

| Chain says | Result |
| --- | --- |
| No promise | Nothing changes. |
| Open promise, issue open | `awaiting-promise` is swapped for `promised`. |
| Open promise, issue closed | The late deposit is kept right away: the bot comments the refund link and sets `promise-kept`. |
| Settled promise | Nothing changes, so a repeated or forged ping can't undo a verdict. |

Pinging twice is harmless. The `Github` port gained `isOpen` for this.

The logic is in `src/pay.ts` behind three ports (GitHub, chain, faucet) with fakes in `src/pay.test.ts`. Adapters are in `src/pay-adapters.ts`.

### Set up sign-in

1. Create an app at https://phantom.com/portal. Allow the origin `https://pinky-bot.vercel.app` and the redirect URL `https://pinky-bot.vercel.app/pay`.
2. Set `PHANTOM_APP_ID` on the Vercel project. Also set `FAUCET_SECRET_KEY` (same JSON array format as `ARBITER_SECRET_KEY`). `USDC_MINT` is optional and defaults to the demo mint.
3. Stock the faucet with test USDC: `cd escrow && npm run fund-faucet` (mints 1000 from the operator key, which is the mint authority; the faucet wallet needs devnet SOL too).
4. Without `PHANTOM_APP_ID` the page offers only the Phantom browser extension. Nothing pretends to be email sign-in.

`npm run pay-e2e -- <owner/repo> <issue>` plays the page against devnet with a throwaway wallet: faucet, deposit, then status. It needs `.env` and makes a real promise on that issue.

### Verified live

On 2026-10-08 a fresh keypair with no balance got 5 test USDC and 0.01 SOL from the faucet, a second faucet call sent nothing, and the deposit transaction built by `/api/deposit-tx`'s code signed by that wallet alone created the promise for `pinky-demo` issue 2. Then, in Chrome with the Phantom extension, a new wallet on the deployed page got test USDC from the faucet and made the promise for [`pinky-demo` issue 3](https://github.com/sivaratrisrinivas/pinky-demo/issues/3). The explorer link opens a finalized devnet transaction that called the escrow program. Phantom simulates on mainnet by default, so it showed "Failed to simulate" and needed "Confirm (unsafe)" twice. Not yet run: Google sign-in through a Phantom embedded wallet, which needs `PHANTOM_APP_ID` (the Portal wasn't accepting new accounts on 2026-10-08).

### What is left on #6

Everything in the issue's acceptance list is checked live except signing in with only an email. The Phantom Developer Portal stopped accepting new accounts on 2026-10-08, so there is no `PHANTOM_APP_ID` and the page uses the extension fallback the issue allows. Once an app exists: set `PHANTOM_APP_ID` on Vercel, add the origin and redirect URL in the Portal, redeploy, and run the page with a Google account.

### Known limits

- Sign-in is Google, not a bare email: `@phantom/browser-sdk` 2.0.4 offers Google, Apple, the Phantom app and the extension. Email sign-in is next.
- The faucet has no rate limit. A wallet can ask again after it spends its USDC, and anyone can make fresh wallets. It is devnet money, but the faucet wallet's SOL is finite.
- Two simultaneous faucet calls for one wallet can both send.
- The page sends the signed transaction to the public devnet RPC, while the functions use `RPC_URL`.
- Each status check makes three GitHub calls to find the repo ID and issue state.

## Not in v1

Mainnet or real USDC, more than one project, GitHub sign-in on the pay page, a `/cosign` command, and maintainers signing their own verdicts.
