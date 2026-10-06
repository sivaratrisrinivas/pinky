# Pinky

Pinky promise this isn't spam.

Pinky asks first-time contributors to a GitHub repo for a small refundable deposit before a maintainer looks at their issue or PR. It keeps maintainers' time for people willing to stake something on not being spam. The money sits in a Solana escrow program until a maintainer gives a verdict.

Built for a hackathon on **Solana devnet** with a test USDC mint. Not for real money.

## How it works

1. A first-timer opens an issue or PR on a project. The Pinky GitHub App labels it `awaiting-promise` and comments a friendly pay link.
2. They sign in with only an email on the pay page, get test USDC and make a 5 USDC **promise**. The label flips to `promised`.
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
| GitHub App event handling and verdicts | Not started ([#4](https://github.com/sivaratrisrinivas/pinky/issues/4), [#5](https://github.com/sivaratrisrinivas/pinky/issues/5)) |
| Pay page with email sign-in and faucet | Not started ([#6](https://github.com/sivaratrisrinivas/pinky/issues/6), [#7](https://github.com/sivaratrisrinivas/pinky/issues/7)) |
| README badge, seed data, full-journey runs | Not started ([#8](https://github.com/sivaratrisrinivas/pinky/issues/8), [#9](https://github.com/sivaratrisrinivas/pinky/issues/9), [#11](https://github.com/sivaratrisrinivas/pinky/issues/11)) |

The spec is [#1](https://github.com/sivaratrisrinivas/pinky/issues/1) and the day-by-day plan is in [PLAN.md](PLAN.md).

## Repo layout

```
escrow/                  Anchor program, tests and operator scripts
  programs/escrow/       init_project, deposit, refund, forfeit
  tests/                 behaviour tests on a local validator
  scripts/               setup-project and smoke, run against devnet
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
```

Keys and the generated `devnet.json` live in `escrow/.keys/` and are gitignored. The wizard `scripts/setup-github-app.sh` creates the demo repo, GitHub App, arbiter and faucet keypairs and `.env` first; `setup-project` reuses its arbiter.

The demo project is `sivaratrisrinivas/pinky-demo` (repo ID 1407786691) with the test USDC mint `BATkjUKVJzLi3YNT7wKvmA6Eh3rkN9wuCpgCNnzL9Wn3`.

## Not in v1

Mainnet or real USDC, more than one project, GitHub sign-in on the pay page, a `/cosign` command, and maintainers signing their own verdicts.
