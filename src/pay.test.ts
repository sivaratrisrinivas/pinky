import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { buildDepositTransaction } from "./deposit-tx.js";
import {
  FAUCET_LAMPORTS,
  FAUCET_USDC,
  payStatus,
  prepareDeposit,
  requestFaucet,
  type FaucetSend,
  type PayPorts,
  type PayProject,
} from "./pay.js";

const REPO = "acme/widgets";
const MINT = Keypair.generate().publicKey;
const PROJECT: PayProject = {
  repoId: 42,
  address: Keypair.generate().publicKey,
  mint: MINT,
  amount: 5_000_000n,
};

function fakePorts(
  options: {
    issue?: { repoId: number; state: "open" | "closed" } | null;
    project?: PayProject | null;
    promised?: boolean;
    balances?: { lamports: bigint; usdc: bigint };
  } = {}
) {
  const sends: FaucetSend[] = [];
  const ports: PayPorts = {
    github: {
      async getIssue() {
        return options.issue === undefined ? { repoId: 42, state: "open" } : options.issue;
      },
    },
    chain: {
      async readProject() {
        return options.project === undefined ? PROJECT : options.project;
      },
      async promiseExists() {
        return options.promised ?? false;
      },
    },
    faucet: {
      async balances() {
        return options.balances ?? { lamports: 0n, usdc: 0n };
      },
      async send(request) {
        sends.push(request);
        return "faucetSig";
      },
    },
    async blockhash() {
      return "11111111111111111111111111111111";
    },
  };
  return { ports, sends };
}

describe("payStatus", () => {
  it("is ready for an open issue in a project with no promise", async () => {
    const { ports } = fakePorts();
    expect(await payStatus({ repo: REPO, number: 7 }, ports)).toEqual({
      state: "ready",
      amount: "5000000",
      mint: MINT.toBase58(),
    });
  });

  it("refuses a closed issue", async () => {
    const { ports } = fakePorts({ issue: { repoId: 42, state: "closed" } });
    expect((await payStatus({ repo: REPO, number: 7 }, ports)).state).toBe("closed");
  });

  it("says the promise is already made when one exists", async () => {
    const { ports } = fakePorts({ promised: true });
    expect((await payStatus({ repo: REPO, number: 7 }, ports)).state).toBe("promised");
  });

  it("reports an issue that doesn't exist", async () => {
    const { ports } = fakePorts({ issue: null });
    expect((await payStatus({ repo: REPO, number: 7 }, ports)).state).toBe("unknown-issue");
  });

  it("reports a repo that isn't a project", async () => {
    const { ports } = fakePorts({ project: null });
    expect((await payStatus({ repo: REPO, number: 7 }, ports)).state).toBe("not-a-project");
  });
});

describe("requestFaucet", () => {
  const wallet = Keypair.generate().publicKey.toBase58();

  it("sends test USDC and SOL to an empty wallet", async () => {
    const { ports, sends } = fakePorts();
    const result = await requestFaucet(wallet, ports);
    expect(sends).toEqual([
      { wallet: new PublicKey(wallet), usdc: FAUCET_USDC, lamports: FAUCET_LAMPORTS },
    ]);
    expect(result).toEqual({ signature: "faucetSig", sentUsdc: true, sentSol: true });
  });

  it("sends nothing to a wallet that already has enough of both", async () => {
    const { ports, sends } = fakePorts({ balances: { lamports: FAUCET_LAMPORTS, usdc: FAUCET_USDC } });
    const result = await requestFaucet(wallet, ports);
    expect(sends).toEqual([]);
    expect(result).toEqual({ signature: null, sentUsdc: false, sentSol: false });
  });

  it("tops up only what is missing", async () => {
    const { ports, sends } = fakePorts({ balances: { lamports: 0n, usdc: FAUCET_USDC } });
    await requestFaucet(wallet, ports);
    expect(sends[0]).toMatchObject({ usdc: 0n, lamports: FAUCET_LAMPORTS });
  });

  it("rejects something that isn't a wallet address", async () => {
    const { ports, sends } = fakePorts();
    await expect(requestFaucet("not-a-key", ports)).rejects.toThrow(/wallet/i);
    expect(sends).toEqual([]);
  });
});

describe("prepareDeposit", () => {
  const wallet = Keypair.generate().publicKey.toBase58();

  it("returns an unsigned transaction paid by the wallet", async () => {
    const { ports } = fakePorts();
    const result = await prepareDeposit({ repo: REPO, number: 7, wallet }, ports);
    if (result.state !== "ready") throw new Error(`expected ready, got ${result.state}`);
    const tx = Transaction.from(Buffer.from(result.transaction, "base64"));
    expect(tx.feePayer?.toBase58()).toBe(wallet);
  });

  it.each([
    ["closed", { issue: { repoId: 42, state: "closed" as const } }],
    ["promised", { promised: true }],
  ])("builds nothing for a %s issue", async (state, options) => {
    const { ports } = fakePorts(options);
    expect(await prepareDeposit({ repo: REPO, number: 7, wallet }, ports)).toEqual({ state });
  });
});

describe("buildDepositTransaction", () => {
  it("creates the token account if needed, then deposits for the issue number", () => {
    const wallet = Keypair.generate().publicKey;
    const tx = buildDepositTransaction({
      wallet,
      project: PROJECT,
      issueNumber: 7,
      blockhash: "11111111111111111111111111111111",
    });
    expect(tx.instructions).toHaveLength(2);
    const deposit = tx.instructions[1]!;
    expect(deposit.data.subarray(8).readBigUInt64LE()).toBe(7n);
    const [promiser, project] = deposit.keys;
    expect(promiser).toMatchObject({ isSigner: true, isWritable: true });
    expect(promiser!.pubkey.equals(wallet)).toBe(true);
    expect(project!.pubkey.equals(PROJECT.address)).toBe(true);
    expect(deposit.keys.map((key) => key.isWritable)).toEqual([true, false, true, true, true, false, false]);
  });
});
