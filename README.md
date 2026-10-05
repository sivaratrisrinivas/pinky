# pinky
pinky promise this isn't spam.

## Escrow program

Anchor program in `escrow/`. Instructions: `init_project`, `deposit`, `refund` (arbiter), `forfeit` (arbiter). Anchor 1.2, so `solana-test-validator` is selected with `ANCHOR_TEST_VALIDATOR=legacy` (the default is surfpool).

```bash
cd escrow
npm install
npm test                                 # builds, runs the tests on a local validator
solana airdrop 5 --url devnet            # or use https://faucet.solana.com
anchor deploy --provider.cluster devnet
npm run setup-project -- <owner>/<repo>  # makes the test USDC mint, arbiter key and project
npm run smoke                            # keep and break on devnet, prints two explorer links
```

Keys live in `escrow/.keys/` (gitignored). Anyone can call `init_project` for any repo ID in v1, so the operator sets up the demo repo first.
