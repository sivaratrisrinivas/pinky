import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { App } from "octokit";
import { payChain, payFaucet, payGithub } from "./pay-adapters.js";
import type { IssueRef, PayPorts } from "./pay.js";

/** Test USDC mint of the demo project on devnet. */
const DEFAULT_MINT = "BATkjUKVJzLi3YNT7wKvmA6Eh3rkN9wuCpgCNnzL9Wn3";
const DEFAULT_RPC = "https://api.devnet.solana.com";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

function keypair(name: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env(name))));
}

export function payPortsFromEnv(): PayPorts {
  const connection = new Connection(process.env.RPC_URL ?? DEFAULT_RPC, "confirmed");
  const app = new App({
    appId: env("GITHUB_APP_ID"),
    privateKey: Buffer.from(env("GITHUB_APP_PRIVATE_KEY_BASE64"), "base64").toString("utf8"),
  });
  return {
    github: payGithub(app),
    chain: payChain({ connection, arbiter: keypair("ARBITER_SECRET_KEY").publicKey }),
    faucet: payFaucet({
      connection,
      faucet: keypair("FAUCET_SECRET_KEY"),
      mint: new PublicKey(process.env.USDC_MINT ?? DEFAULT_MINT),
    }),
    async blockhash() {
      return (await connection.getLatestBlockhash("confirmed")).blockhash;
    },
  };
}

/** What the browser needs to start Phantom Connect. Null until the Portal app exists. */
export function phantomAppId(): string | null {
  return process.env.PHANTOM_APP_ID ?? null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Parses `owner/name` and an issue number, or null when either is malformed. */
export function parseIssueRef(repo: unknown, number: unknown): IssueRef | null {
  const n = Number(number);
  if (typeof repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return { repo, number: n };
}
