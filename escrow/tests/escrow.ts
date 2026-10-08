import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import {
  createMint,
  createAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { Escrow } from "../target/types/escrow";
import {
  AGED,
  AGED_ISSUE,
  AgedPromise,
  promiseAddress as agedPromiseAddress,
  projectAddress,
} from "./aged-promises";

const AMOUNT = 5_000_000; // 5 test USDC, 6 decimals

describe("escrow", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const connection = provider.connection;
  const program = anchor.workspace.escrow as Program<Escrow>;
  const operator = (provider.wallet as anchor.Wallet).payer;

  let nextId = 1;
  const nextRepoId = () => new BN(nextId++);

  async function fundedWallet(): Promise<Keypair> {
    const wallet = Keypair.generate();
    const sig = await connection.requestAirdrop(
      wallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig, "confirmed");
    return wallet;
  }

  async function balance(account: PublicKey): Promise<number> {
    return Number((await getAccount(connection, account)).amount);
  }

  async function fund(wallet: PublicKey) {
    const sig = await connection.requestAirdrop(wallet, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  // With `aged`, the project takes the repo ID and mint of a promise that was
  // loaded into the validator already older than 30 days.
  async function setup(aged?: AgedPromise) {
    const arbiter = await fundedWallet();
    const mint = await createMint(
      connection,
      operator,
      operator.publicKey,
      null,
      6,
      aged?.mint
    );
    const maintainerWallet = await createAccount(
      connection,
      operator,
      mint,
      Keypair.generate().publicKey
    );
    const repoId = aged ? new BN(aged.repoId) : nextRepoId();
    const [project] = PublicKey.findProgramAddressSync(
      [Buffer.from("project"), repoId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), project.toBuffer()],
      program.programId
    );
    await program.methods
      .initProject(repoId, new BN(AMOUNT), arbiter.publicKey)
      .accountsPartial({ mint, maintainerWallet })
      .rpc();
    return { arbiter, mint, maintainerWallet, project, vault };
  }
  type Project = Awaited<ReturnType<typeof setup>>;

  function promiseAddress(project: PublicKey, issue: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("promise"),
        project.toBuffer(),
        new BN(issue).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];
  }

  async function promiser(p: Project, tokens = AMOUNT) {
    const wallet = await fundedWallet();
    const token = await createAccount(
      connection,
      operator,
      p.mint,
      wallet.publicKey
    );
    if (tokens > 0) {
      await mintTo(connection, operator, p.mint, token, operator, tokens);
    }
    return { wallet, token };
  }

  async function deposit(
    p: Project,
    who: { wallet: Keypair; token: PublicKey },
    issue: number
  ) {
    await program.methods
      .deposit(new BN(issue))
      .accountsPartial({
        promiser: who.wallet.publicKey,
        project: p.project,
        promiserToken: who.token,
      })
      .signers([who.wallet])
      .rpc();
    return promiseAddress(p.project, issue);
  }

  function refund(
    p: Project,
    promise: PublicKey,
    token: PublicKey,
    signer: Keypair
  ) {
    return program.methods
      .refund()
      .accountsPartial({
        arbiter: signer.publicKey,
        project: p.project,
        promise,
        promiserToken: token,
      })
      .signers([signer])
      .rpc();
  }

  function forfeit(p: Project, promise: PublicKey, signer: Keypair) {
    return program.methods
      .forfeit()
      .accountsPartial({
        arbiter: signer.publicKey,
        project: p.project,
        promise,
        maintainerWallet: p.maintainerWallet,
      })
      .signers([signer])
      .rpc();
  }

  function reclaim(
    p: Project,
    promise: PublicKey,
    token: PublicKey,
    signer: Keypair
  ) {
    return program.methods
      .reclaim()
      .accountsPartial({
        promiser: signer.publicKey,
        project: p.project,
        promise,
        promiserToken: token,
      })
      .signers([signer])
      .rpc();
  }

  // A project holding a promise that is already older than 30 days. Live
  // deposits by bystanders keep the vault funded, so only the rules in
  // `reclaim` decide whether the money can move.
  async function agedProject(aged: AgedPromise) {
    const p = await setup(aged);
    expect(p.project.toBase58()).to.equal(
      projectAddress(aged.repoId).toBase58()
    );
    await fund(aged.promiser.publicKey);
    const token = await createAccount(
      connection,
      operator,
      p.mint,
      aged.promiser.publicKey,
      aged.promiserToken
    );
    // Two promises' worth, so a vault that paid one out still has funds.
    await deposit(p, await promiser(p), 2);
    await deposit(p, await promiser(p), 3);
    return {
      p,
      who: { wallet: aged.promiser, token },
      promise: agedPromiseAddress(p.project, AGED_ISSUE),
    };
  }

  async function fails(action: Promise<unknown>, errorCode?: string) {
    let error: unknown;
    try {
      await action;
    } catch (e) {
      error = e;
    }
    expect(error, "expected the transaction to fail").to.not.equal(undefined);
    if (errorCode) {
      expect(String(error)).to.include(errorCode);
    }
  }

  it("deposit then refund returns the full amount to the promiser", async () => {
    const p = await setup();
    const who = await promiser(p);

    const promise = await deposit(p, who, 7);
    expect(await balance(who.token)).to.equal(0);
    expect(await balance(p.vault)).to.equal(AMOUNT);

    await refund(p, promise, who.token, p.arbiter);

    expect(await balance(who.token)).to.equal(AMOUNT);
    expect(await balance(p.vault)).to.equal(0);
    expect((await program.account.promise.fetch(promise)).state).to.deep.equal({
      kept: {},
    });
  });

  it("deposit then forfeit sends the full amount to the maintainer wallet", async () => {
    const p = await setup();
    const who = await promiser(p);

    const promise = await deposit(p, who, 8);
    await forfeit(p, promise, p.arbiter);

    expect(await balance(p.maintainerWallet)).to.equal(AMOUNT);
    expect(await balance(who.token)).to.equal(0);
    expect(await balance(p.vault)).to.equal(0);
    expect((await program.account.promise.fetch(promise)).state).to.deep.equal({
      broken: {},
    });
  });

  it("a second deposit for the same issue number fails", async () => {
    const p = await setup();
    const first = await promiser(p);
    const second = await promiser(p);

    await deposit(p, first, 9);
    await fails(deposit(p, second, 9));

    expect(await balance(second.token)).to.equal(AMOUNT);
    expect(await balance(p.vault)).to.equal(AMOUNT);
  });

  it("refund or forfeit on a settled promise fails", async () => {
    const p = await setup();
    const kept = await promiser(p);
    const broken = await promiser(p);
    const keptPromise = await deposit(p, kept, 1);
    const brokenPromise = await deposit(p, broken, 2);
    // A third open promise keeps the shared vault funded, so only the state
    // check can stop a second settlement.
    const bystander = await promiser(p);
    await deposit(p, bystander, 3);
    await refund(p, keptPromise, kept.token, p.arbiter);
    await forfeit(p, brokenPromise, p.arbiter);

    await fails(
      refund(p, keptPromise, kept.token, p.arbiter),
      "PromiseSettled"
    );
    await fails(forfeit(p, keptPromise, p.arbiter), "PromiseSettled");
    await fails(
      refund(p, brokenPromise, broken.token, p.arbiter),
      "PromiseSettled"
    );
    await fails(forfeit(p, brokenPromise, p.arbiter), "PromiseSettled");

    expect(await balance(kept.token)).to.equal(AMOUNT);
    expect(await balance(p.maintainerWallet)).to.equal(AMOUNT);
    expect(await balance(p.vault)).to.equal(AMOUNT);
  });

  it("refund or forfeit signed by anyone but the arbiter fails", async () => {
    const p = await setup();
    const who = await promiser(p);
    const promise = await deposit(p, who, 3);
    const stranger = await fundedWallet();

    await fails(refund(p, promise, who.token, stranger), "NotArbiter");
    await fails(forfeit(p, promise, stranger), "NotArbiter");
    await fails(refund(p, promise, who.token, who.wallet), "NotArbiter");

    expect(await balance(p.vault)).to.equal(AMOUNT);
    expect((await program.account.promise.fetch(promise)).state).to.deep.equal({
      open: {},
    });
  });

  it("a promise paid by a vouching wallet refunds to that wallet", async () => {
    const p = await setup();
    const voucher = await promiser(p);
    const firstTimer = await promiser(p, 0);

    const promise = await deposit(p, voucher, 4);
    await fails(refund(p, promise, firstTimer.token, p.arbiter));
    await refund(p, promise, voucher.token, p.arbiter);

    expect(await balance(voucher.token)).to.equal(AMOUNT);
    expect(await balance(firstTimer.token)).to.equal(0);
  });

  it("forfeit cannot be redirected away from the maintainer wallet", async () => {
    const p = await setup();
    const who = await promiser(p);
    const promise = await deposit(p, who, 5);

    await fails(
      program.methods
        .forfeit()
        .accountsPartial({
          arbiter: p.arbiter.publicKey,
          project: p.project,
          promise,
          maintainerWallet: who.token,
        })
        .signers([p.arbiter])
        .rpc()
    );
    expect(await balance(p.vault)).to.equal(AMOUNT);
  });

  it("a promise cannot be settled through another project's accounts", async () => {
    const a = await setup();
    const b = await setup();
    const who = await promiser(a);
    const promise = await deposit(a, who, 6);

    await fails(
      program.methods
        .refund()
        .accountsPartial({
          arbiter: b.arbiter.publicKey,
          project: b.project,
          promise,
          promiserToken: who.token,
        })
        .signers([b.arbiter])
        .rpc()
    );
  });

  it("reclaim on a promise younger than 30 days fails", async () => {
    const p = await setup();
    const who = await promiser(p);
    const promise = await deposit(p, who, 10);

    await fails(
      reclaim(p, promise, who.token, who.wallet),
      "TooEarlyToReclaim"
    );

    expect(await balance(who.token)).to.equal(0);
    expect(await balance(p.vault)).to.equal(AMOUNT);
    expect((await program.account.promise.fetch(promise)).state).to.deep.equal({
      open: {},
    });
  });

  it("reclaim on a promise older than 30 days refunds the promiser and marks it kept", async () => {
    const { p, who, promise } = await agedProject(AGED.reclaimed);
    expect(await balance(who.token)).to.equal(0);

    await reclaim(p, promise, who.token, who.wallet);

    expect(await balance(who.token)).to.equal(AMOUNT);
    expect(await balance(p.vault)).to.equal(AMOUNT); // the bystanders' other promise
    expect((await program.account.promise.fetch(promise)).state).to.deep.equal({
      kept: {},
    });
  });

  it("reclaim on a settled promise fails", async () => {
    const { p, who, promise } = await agedProject(AGED.settled);
    await refund(p, promise, who.token, p.arbiter);

    await fails(reclaim(p, promise, who.token, who.wallet), "PromiseSettled");

    expect(await balance(who.token)).to.equal(AMOUNT);
    expect(await balance(p.vault)).to.equal(AMOUNT);
  });

  it("a wallet other than the promiser cannot reclaim", async () => {
    const { p, who, promise } = await agedProject(AGED.notPromiser);
    const stranger = await fundedWallet();

    await fails(reclaim(p, promise, who.token, stranger), "NotPromiser");
    await fails(reclaim(p, promise, who.token, p.arbiter), "NotPromiser");

    expect(await balance(who.token)).to.equal(0);
    expect(await balance(p.vault)).to.equal(2 * AMOUNT);
    expect((await program.account.promise.fetch(promise)).state).to.deep.equal({
      open: {},
    });
  });
});
