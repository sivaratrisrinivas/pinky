# Pinky: build plan to Oct 12

Pinky, as in pinky promise. The bot asks "Pinky promise this isn't spam?" A co-sign is a second pinky.

The goal is a working loop on Solana devnet, two videos and a write-up, submitted by noon PT on Oct 12. Not 11:59pm. I'm new to Solana and AI agents write most of the code, so every day has to end with something that runs.

## The one journey

Everything outside this list is cut.

1. A non-collaborator opens an issue or PR on the demo repo.
2. The GitHub App labels it `awaiting-deposit` and comments a friendly pay link.
3. The contributor signs in with email through a Phantom Connect embedded wallet and deposits 5 devnet USDC. The label flips to `deposited`.
4. The maintainer comments `/accept`, `/goodfaith` or `/spam`. The first two refund the deposit. `/spam` forfeits it to the project fund. The bot posts the transaction link as a comment either way.
5. Stretch goal. A collaborator comments `/cosign @newcomer`, which locks the collaborator's deposit against the newcomer's PR.

Cut: reputation scores, dashboards, AI classifiers, mainnet, multiple chains, multiple repos, settings UI.

## Stack

Picked for a first-time Solana builder.

- **Escrow program.** Anchor, in Rust. Four instructions: `init_project` creates the vault and fund for a repo, `deposit` is keyed by repo and issue number, then `refund` and `forfeit`. Add `cosign` only if day 5 has room. It's `deposit` where the depositor isn't the author.
- **Who releases funds.** In v1 the GitHub App holds an arbiter keypair and signs only for slash commands from users with write access. The write-up says so plainly: "v1 trusts the app, v2 has the maintainer's own wallet sign." Judges respect a trust model you state up front.
- **GitHub App.** Node with Octokit or Probot. Webhooks for `issues.opened`, `pull_request.opened` and `issue_comment.created`. Deploy on Railway, Fly or Vercel.
- **Pay page.** Next.js with Phantom Connect for email sign-in, plus a "Get 5 test USDC" button paid from my own faucet wallet. Judges won't have devnet USDC.
- **Fallback.** If the Rust and Anchor install fights me for more than 2 hours, I build and deploy the program in Solana Playground, which runs in the browser and is on the event's resources page.

## Day by day

### Day 1, Mon Oct 5: validate and set up

- Send the maintainer message below to 15 maintainers who've complained in public about AI PRs or slop reports. Search GitHub issues and X for "AI slop", "AI-generated PR" and "closing low-effort". Log every reply in a sheet. The replies are my traction and my founder story.
- Install Rust, the Solana CLI, Anchor and Node. Get a devnet airdrop working. Create my own USDC-like mint on devnet, which is simpler than relying on a faucet.
- Create the public demo repo and register the GitHub App. Fill in the project profile on Colosseum Arena.
- Done when a hello-world Anchor program is on devnet and the App receives a webhook.

### Day 2, Tue Oct 6: the escrow program

- Write `init_project`, `deposit`, `refund` and `forfeit`, with Anchor tests on localnet. Deposit then refund returns the money. Deposit then forfeit sends it to the fund. A second refund fails. A caller who isn't the arbiter fails.
- Deploy to devnet.
- Done when a script runs deposit → refund and deposit → forfeit on devnet and prints both transaction links.

### Day 3, Wed Oct 7: the GitHub App

- When a non-collaborator opens an issue or PR, add the label and comment a pay link like `/pay?repo=…&n=…`. Skip collaborators.
- Slash commands from users with write access call the program with the arbiter key. The bot replies with the transaction link.
- Write the bot comment copy now. See the polish section.
- Draft the pitch script in `ideas.md` and record a 1-minute weekly update video for Arena.
- Done when `/spam` on a seeded issue moves devnet funds and the bot reports it.

### Day 4, Thu Oct 8: the pay page and the full loop

- Build the flow: Phantom Connect email sign-in, "Get test USDC", "Deposit 5 USDC", then a confirmation that sends the App a webhook to flip the label.
- Run the full journey from a second GitHub account 5 times in a row without touching the code.
- Done when a stranger with only an email address can finish steps 1 to 4.

### Day 5, Fri Oct 9: co-sign, badge, seed data

- `/cosign @user` as a stretch goal. If it isn't working by 4pm, cut it and say "co-sign is next" in the pitch.
- Add a README badge served by the App: "Pinky-protected: N promises, M broken".
- Write a seed script that opens about 10 issues from test accounts so the demo repo looks used. The README says the issues are seeded.
- Feature freeze at the end of the day.

### Day 6, Sat Oct 10: polish and the demo video

- Polish the three details below. Fix only what a judge would see.
- Record the demo video, 3 minutes max: issue opened, label, email sign-in, deposit, `/accept` refund, `/spam` forfeit, explorer links, badge.

### Day 7, Sun Oct 11: pitch video and write-up

- Record the pitch video, 2 to 3 minutes, from the script in `ideas.md`. Open on curl. Say what Pinky is in one sentence. Show 60 seconds of the demo. Then cover market, business model and why me, with the maintainer replies as traction.
- Write the write-up, README, go-to-market section and team background. All of it tells the same story.

### Day 8, Mon Oct 12: submit

- Re-test every live link from a fresh browser. Submit by noon PT. Post the X thread with the demo clip.

## Polish these three until they're right

1. **The bot comment.** It should sound like a kind maintainer, with no crypto jargon. Draft:
   > Thanks for opening this! Pinky promise it isn't spam? This project asks first-time contributors for a small refundable deposit of 5 USDC. You get it back when the issue is closed in good faith, usually within a few days. [Make the promise: 30 seconds, email sign-in] · Can't pay? Any existing contributor can pinky-promise for you.
2. **The 30-second payment.** Email in, get test USDC, one tap to deposit, done. No seed phrase, no wallet install.
3. **The badge.** It's what maintainers share, the thing they put in their README.

## Day 1 maintainer message

Send to 15.

> Hi [name], I saw your post about [AI-generated PRs / slop reports in repo]. I'm building a small GitHub App and want to know if it would help before I go further.
>
> One question. Would you turn on a $5 refundable deposit for first-time contributors? You'd return it when you close their issue or PR in good faith, keep it for the project if it's spam, and waive it when an existing contributor co-signs for them.
>
> A yes or no is plenty. Thanks for maintaining [project].

Count the yeses and maybes, and write down why each no said no. Those reasons are my answers for the Zoom interview.

## Risks

- **The toolchain eats days 1 and 2.** Switch to Solana Playground at the 2-hour mark.
- **Phantom Connect setup is unclear.** Fall back to the regular Phantom browser extension for the demo and say email sign-in comes next. Don't fake the email sign-in.
- **No maintainer replies by day 4.** Send 15 more. "2 of 30 said yes, and here's why the rest said no" is still honest traction.
