// Runs one promise through keep and one through break on devnet.
// Usage: npm run smoke
import { BN } from "@anchor-lang/core";
import {
  createAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  AMOUNT,
  connect,
  explorerTx,
  loadConfig,
  loadOrCreateKey,
  promiseAddress,
} from "./lib";

async function main() {
  const config = loadConfig();
  const { connection, operator, program } = connect();
  const arbiter = loadOrCreateKey("arbiter");
  const mint = new PublicKey(config.mint);
  const project = new PublicKey(config.project);
  const maintainerWallet = new PublicKey(config.maintainerWallet);

  const balance = async (account: PublicKey) =>
    Number((await getAccount(connection, account)).amount) / 1e6;

  // Fake issue numbers far above any real one, so reruns and real issues don't collide.
  const base = 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);

  // The arbiter pays its own fees, so it needs a little SOL.
  const fee = 0.01 * LAMPORTS_PER_SOL;
  if ((await connection.getBalance(arbiter.publicKey)) < fee) {
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: operator.publicKey,
          toPubkey: arbiter.publicKey,
          lamports: 0.05 * LAMPORTS_PER_SOL,
        })
      ),
      [operator]
    );
  }

  async function makePromise(issue: number) {
    const promiser = Keypair.generate();
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: operator.publicKey,
          toPubkey: promiser.publicKey,
          lamports: 0.01 * LAMPORTS_PER_SOL,
        })
      ),
      [operator]
    );
    const promiserToken = await createAccount(connection, operator, mint, promiser.publicKey);
    await mintTo(connection, operator, mint, promiserToken, operator, AMOUNT);
    const depositSig = await program.methods
      .deposit(new BN(issue))
      .accountsPartial({ promiser: promiser.publicKey, project, promiserToken })
      .signers([promiser])
      .rpc();
    const promise = promiseAddress(program.programId, project, new BN(issue));
    return { promiserToken, promise, depositSig };
  }

  const kept = await makePromise(base);
  const keptSig = await program.methods
    .refund()
    .accountsPartial({
      arbiter: arbiter.publicKey,
      project,
      promise: kept.promise,
      promiserToken: kept.promiserToken,
    })
    .signers([arbiter])
    .rpc();
  console.log(`Kept   (promiser balance ${await balance(kept.promiserToken)} USDC): ${explorerTx(keptSig)}`);

  const maintainerBefore = await balance(maintainerWallet);
  const broken = await makePromise(base + 1);
  const brokenSig = await program.methods
    .forfeit()
    .accountsPartial({
      arbiter: arbiter.publicKey,
      project,
      promise: broken.promise,
      maintainerWallet,
    })
    .signers([arbiter])
    .rpc();
  const maintainerAfter = await balance(maintainerWallet);
  console.log(
    `Broken (maintainer wallet +${maintainerAfter - maintainerBefore} USDC): ${explorerTx(brokenSig)}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
