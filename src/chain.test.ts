import { createHash } from "node:crypto";
import { Keypair, PublicKey, type GetProgramAccountsFilter, type TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { createChain, promiseAddress, PROGRAM_ID, projectAddress } from "./chain.js";

const ARBITER_KEY = Keypair.generate();
const ARBITER = ARBITER_KEY.publicKey;
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const MAINTAINER_WALLET = Keypair.generate().publicKey;

function projectAccount(repoId: bigint, arbiter: PublicKey, discriminator = "Project") {
  const data = Buffer.alloc(8 + 8 + 32 * 3 + 8 + 2);
  createHash("sha256").update(`account:${discriminator}`).digest().copy(data, 0, 0, 8);
  data.writeBigUInt64LE(repoId, 8);
  arbiter.toBuffer().copy(data, 16);
  Keypair.generate().publicKey.toBuffer().copy(data, 48); // mint
  MAINTAINER_WALLET.toBuffer().copy(data, 80);
  data.writeBigUInt64LE(5_000_000n, 112);
  return { data };
}

const PROMISER_TOKEN = Keypair.generate().publicKey;

function promiseAccount(repoId: bigint, issue: bigint, state: number, discriminator = "Promise") {
  const data = Buffer.alloc(8 + 32 + 8 + 32 + 32 + 8 + 1 + 8 + 1);
  createHash("sha256").update(`account:${discriminator}`).digest().copy(data, 0, 0, 8);
  projectAddress(PROGRAM_ID, repoId).toBuffer().copy(data, 8);
  data.writeBigUInt64LE(issue, 40);
  Keypair.generate().publicKey.toBuffer().copy(data, 48); // promiser
  PROMISER_TOKEN.toBuffer().copy(data, 80);
  data.writeBigUInt64LE(5_000_000n, 112);
  data.writeUInt8(state, 120);
  return { data };
}

interface FakeSignature {
  signature: string;
  err: unknown;
}

type ProgramFilter = GetProgramAccountsFilter;

/** The RPC's filter semantics: exact account size, or bytes (base58) at an offset. */
function matches(filter: ProgramFilter, data: Buffer): boolean {
  if ("dataSize" in filter) return data.length === filter.dataSize;
  const { offset, bytes } = filter.memcmp;
  const expected = new PublicKey(bytes).toBuffer();
  return data.subarray(offset, offset + expected.length).equals(expected);
}

function fakeRpc(options: {
  accounts: Map<string, { data: Buffer }>;
  signatures?: Map<string, FakeSignature[]>;
}) {
  const sent: { instruction: TransactionInstruction; signer: Keypair }[] = [];
  const connection = {
    async getAccountInfo(address: PublicKey) {
      return options.accounts.get(address.toBase58()) ?? null;
    },
    async getSignaturesForAddress(address: PublicKey) {
      return options.signatures?.get(address.toBase58()) ?? [];
    },
    async getProgramAccounts(programId: PublicKey, config: { filters?: ProgramFilter[] }) {
      if (!programId.equals(PROGRAM_ID)) return [];
      return [...options.accounts]
        .filter(([, account]) => (config.filters ?? []).every((filter) => matches(filter, account.data)))
        .map(([address, account]) => ({ pubkey: new PublicKey(address), account }));
    },
  };
  const send = async (instruction: TransactionInstruction, signer: Keypair) => {
    sent.push({ instruction, signer });
    return "sentSig";
  };
  return { connection, send, sent };
}

function chainWith(accounts: Map<string, { data: Buffer }>) {
  const { connection, send } = fakeRpc({ accounts });
  return createChain({ arbiter: ARBITER_KEY, connection, send });
}

describe("chain.readProject", () => {
  it("reads a project created with our arbiter", async () => {
    const address = projectAddress(PROGRAM_ID, 1407786691n);
    const chain = chainWith(new Map([[address.toBase58(), projectAccount(1407786691n, ARBITER)]]));

    expect(await chain.readProject(1407786691)).toEqual({ repoId: 1407786691 });
  });

  it("returns null when the repo has no project account", async () => {
    expect(await chainWith(new Map()).readProject(1407786691)).toBeNull();
  });

  it("returns null for a project that names someone else as arbiter", async () => {
    const address = projectAddress(PROGRAM_ID, 5n);
    const other = projectAccount(5n, Keypair.generate().publicKey);

    expect(await chainWith(new Map([[address.toBase58(), other]])).readProject(5)).toBeNull();
  });

  it("returns null for an account that isn't a Project", async () => {
    const address = projectAddress(PROGRAM_ID, 5n);
    const wrong = projectAccount(5n, ARBITER, "Promise");

    expect(await chainWith(new Map([[address.toBase58(), wrong]])).readProject(5)).toBeNull();
  });
});

describe("chain.readPromise", () => {
  const REPO = 1407786691n;
  const project = projectAddress(PROGRAM_ID, REPO);
  const projectEntry = [project.toBase58(), projectAccount(REPO, ARBITER)] as const;

  function chainWithPromise(state: number, signatures: FakeSignature[] = []) {
    const address = promiseAddress(PROGRAM_ID, project, 7n);
    const { connection, send } = fakeRpc({
      accounts: new Map([projectEntry, [address.toBase58(), promiseAccount(REPO, 7n, state)]]),
      signatures: new Map([[address.toBase58(), signatures]]),
    });
    return createChain({ arbiter: ARBITER_KEY, connection, send });
  }

  it("returns null when nobody made a promise for the issue", async () => {
    expect(await chainWith(new Map([projectEntry])).readPromise(Number(REPO), 7)).toBeNull();
  });

  it("reads an open promise", async () => {
    expect(await chainWithPromise(0).readPromise(Number(REPO), 7)).toEqual({ state: "open" });
  });

  it("reads a settled promise with the latest successful transaction", async () => {
    const chain = chainWithPromise(1, [
      { signature: "failedSig", err: { InstructionError: [0, "Custom"] } },
      { signature: "settledSig", err: null },
      { signature: "depositSig", err: null },
    ]);

    expect(await chain.readPromise(Number(REPO), 7)).toEqual({ state: "kept", settlementTx: "settledSig" });
  });

  it("reads a broken promise, with no transaction when none is found", async () => {
    expect(await chainWithPromise(2).readPromise(Number(REPO), 7)).toEqual({
      state: "broken",
      settlementTx: null,
    });
  });

  it("returns null for an account that isn't a Promise", async () => {
    const address = promiseAddress(PROGRAM_ID, project, 7n);
    const wrong = promiseAccount(REPO, 7n, 0, "Project");

    expect(
      await chainWith(new Map([projectEntry, [address.toBase58(), wrong]])).readPromise(Number(REPO), 7)
    ).toBeNull();
  });
});

describe("chain.settle", () => {
  const REPO = 1407786691n;
  const project = projectAddress(PROGRAM_ID, REPO);
  const promise = promiseAddress(PROGRAM_ID, project, 7n);
  const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), project.toBuffer()], PROGRAM_ID)[0];

  function setup() {
    const rpc = fakeRpc({
      accounts: new Map([
        [project.toBase58(), projectAccount(REPO, ARBITER)],
        [promise.toBase58(), promiseAccount(REPO, 7n, 0)],
      ]),
    });
    const chain = createChain({ arbiter: ARBITER_KEY, connection: rpc.connection, send: rpc.send });
    return { chain, sent: rpc.sent };
  }

  const accountsOf = (instruction: TransactionInstruction) =>
    instruction.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]);

  it("keeps by calling refund, paying the promiser's token account", async () => {
    const { chain, sent } = setup();

    expect(await chain.settle(Number(REPO), 7, "kept")).toBe("sentSig");

    expect(sent).toHaveLength(1);
    const { instruction, signer } = sent[0]!;
    expect(signer.publicKey.equals(ARBITER)).toBe(true);
    expect(instruction.programId.equals(PROGRAM_ID)).toBe(true);
    expect([...instruction.data]).toEqual([2, 96, 183, 251, 63, 208, 46, 46]);
    expect(accountsOf(instruction)).toEqual([
      [ARBITER.toBase58(), true, false],
      [project.toBase58(), false, false],
      [promise.toBase58(), false, true],
      [vault.toBase58(), false, true],
      [PROMISER_TOKEN.toBase58(), false, true],
      [TOKEN_PROGRAM, false, false],
    ]);
  });

  it("breaks by calling forfeit, paying the maintainer wallet", async () => {
    const { chain, sent } = setup();

    await chain.settle(Number(REPO), 7, "broken");

    const { instruction } = sent[0]!;
    expect([...instruction.data]).toEqual([80, 154, 237, 158, 244, 198, 154, 9]);
    expect(accountsOf(instruction)[4]).toEqual([MAINTAINER_WALLET.toBase58(), false, true]);
  });

  it("refuses a project that names someone else as arbiter", async () => {
    const rpc = fakeRpc({
      accounts: new Map([
        [project.toBase58(), projectAccount(REPO, Keypair.generate().publicKey)],
        [promise.toBase58(), promiseAccount(REPO, 7n, 0)],
      ]),
    });
    const chain = createChain({ arbiter: ARBITER_KEY, connection: rpc.connection, send: rpc.send });

    await expect(chain.settle(Number(REPO), 7, "kept")).rejects.toThrow(/project/);
    expect(rpc.sent).toEqual([]);
  });

  it("throws when there is no promise to settle", async () => {
    const rpc = fakeRpc({ accounts: new Map([[project.toBase58(), projectAccount(REPO, ARBITER)]]) });
    const chain = createChain({ arbiter: ARBITER_KEY, connection: rpc.connection, send: rpc.send });

    await expect(chain.settle(Number(REPO), 7, "broken")).rejects.toThrow(/promise/);
    expect(rpc.sent).toEqual([]);
  });
});

describe("chain.countPromises", () => {
  const REPO = 1407786691n;
  const project = projectAddress(PROGRAM_ID, REPO);
  const projectEntry = [project.toBase58(), projectAccount(REPO, ARBITER)] as const;

  const promiseEntry = (repo: bigint, issue: bigint, state: number) =>
    [
      promiseAddress(PROGRAM_ID, projectAddress(PROGRAM_ID, repo), issue).toBase58(),
      promiseAccount(repo, issue, state),
    ] as const;

  it("counts every promise, open included, and the broken ones", async () => {
    const chain = chainWith(
      new Map([
        projectEntry,
        promiseEntry(REPO, 1n, 0),
        promiseEntry(REPO, 2n, 1),
        promiseEntry(REPO, 3n, 2),
        promiseEntry(REPO, 4n, 2),
      ])
    );

    expect(await chain.countPromises(Number(REPO))).toEqual({ promises: 4, broken: 2 });
  });

  it("counts a project with no promises as zero", async () => {
    expect(await chainWith(new Map([projectEntry])).countPromises(Number(REPO))).toEqual({
      promises: 0,
      broken: 0,
    });
  });

  it("leaves out the promises of other projects", async () => {
    const chain = chainWith(new Map([projectEntry, promiseEntry(REPO, 1n, 2), promiseEntry(99n, 1n, 2)]));

    expect(await chain.countPromises(Number(REPO))).toEqual({ promises: 1, broken: 1 });
  });

  it("returns null for a repo that isn't a project of ours", async () => {
    const other = projectAccount(REPO, Keypair.generate().publicKey);
    const chain = chainWith(new Map([[project.toBase58(), other], promiseEntry(REPO, 1n, 2)]));

    expect(await chain.countPromises(Number(REPO))).toBeNull();
    expect(await chainWith(new Map()).countPromises(Number(REPO))).toBeNull();
  });
});
