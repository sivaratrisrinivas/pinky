import { PublicKey } from "@solana/web3.js";
import { buildDepositTransaction } from "./deposit-tx.js";

/** One test-USDC promise, 6 decimals. Matches the project's amount in the demo. */
export const FAUCET_USDC = 5_000_000n;
/** Covers the promise account's rent, the token account's rent and fees. */
export const FAUCET_LAMPORTS = 10_000_000n;

export interface IssueRef {
  /** `owner/name`. */
  repo: string;
  number: number;
}

export class InvalidWalletError extends Error {
  constructor() {
    super("Invalid wallet address");
  }
}

export interface PayProject {
  repoId: number;
  /** The project account's address. */
  address: PublicKey;
  mint: PublicKey;
  /** Promise amount in the mint's base units. */
  amount: bigint;
}

export interface FaucetSend {
  wallet: PublicKey;
  usdc: bigint;
  lamports: bigint;
}

export interface PayPorts {
  github: {
    /** The issue or PR, or null when it doesn't exist. */
    getIssue(repo: string, number: number): Promise<{ repoId: number; state: "open" | "closed" } | null>;
  };
  chain: {
    /** The project for a GitHub repo ID, or null when the repo isn't one of ours. */
    readProject(repoId: number): Promise<PayProject | null>;
    promiseExists(repoId: number, issueNumber: number): Promise<boolean>;
  };
  faucet: {
    balances(wallet: PublicKey): Promise<{ lamports: bigint; usdc: bigint }>;
    /** Sends test USDC and SOL in one transaction and returns its signature. */
    send(request: FaucetSend): Promise<string>;
  };
  blockhash(): Promise<string>;
}

export type PayRefusal = "closed" | "promised" | "unknown-issue" | "not-a-project";

export type PayStatus = { state: "ready"; amount: string; mint: string } | { state: PayRefusal };

async function check(
  request: IssueRef,
  ports: PayPorts
): Promise<{ refusal: PayRefusal } | { project: PayProject }> {
  const issue = await ports.github.getIssue(request.repo, request.number);
  if (!issue) return { refusal: "unknown-issue" };
  const project = await ports.chain.readProject(issue.repoId);
  if (!project) return { refusal: "not-a-project" };
  if (await ports.chain.promiseExists(issue.repoId, request.number)) return { refusal: "promised" };
  if (issue.state === "closed") return { refusal: "closed" };
  return { project };
}

export async function payStatus(
  request: IssueRef,
  ports: PayPorts
): Promise<PayStatus> {
  const result = await check(request, ports);
  if ("refusal" in result) return { state: result.refusal };
  return { state: "ready", amount: result.project.amount.toString(), mint: result.project.mint.toBase58() };
}

export async function prepareDeposit(
  request: IssueRef & { wallet: string },
  ports: PayPorts
): Promise<{ state: "ready"; transaction: string } | { state: PayRefusal }> {
  const wallet = parseWallet(request.wallet);
  const result = await check(request, ports);
  if ("refusal" in result) return { state: result.refusal };

  const transaction = buildDepositTransaction({
    wallet,
    project: result.project,
    issueNumber: request.number,
    blockhash: await ports.blockhash(),
  });
  const bytes = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { state: "ready", transaction: Buffer.from(bytes).toString("base64") };
}

export interface FaucetResult {
  signature: string | null;
  sentUsdc: boolean;
  sentSol: boolean;
}

/** Tops a wallet up to one promise's worth of test USDC and enough SOL. Asking twice sends nothing twice. */
export async function requestFaucet(wallet: string, ports: PayPorts): Promise<FaucetResult> {
  const address = parseWallet(wallet);
  const balances = await ports.faucet.balances(address);
  const usdc = balances.usdc < FAUCET_USDC ? FAUCET_USDC : 0n;
  const lamports = balances.lamports < FAUCET_LAMPORTS ? FAUCET_LAMPORTS : 0n;
  if (usdc === 0n && lamports === 0n) return { signature: null, sentUsdc: false, sentSol: false };

  const signature = await ports.faucet.send({ wallet: address, usdc, lamports });
  return { signature, sentUsdc: usdc > 0n, sentSol: lamports > 0n };
}

function parseWallet(wallet: string): PublicKey {
  try {
    return new PublicKey(wallet);
  } catch {
    throw new InvalidWalletError();
  }
}
