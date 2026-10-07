import { PublicKey } from "@solana/web3.js";
import { env, findRepoInstallation, githubApp, keypair, rpcConnection } from "./app-env.js";
import { createChain, sendWith } from "./chain.js";
import { githubFor } from "./github.js";
import type { Ports, RepoRef } from "./handle-event.js";
import { payChain, payFaucet, payGithub } from "./pay-adapters.js";
import type { IssueRef, PayPorts } from "./pay.js";

/** Test USDC mint of the demo project on devnet. */
const DEFAULT_MINT = "BATkjUKVJzLi3YNT7wKvmA6Eh3rkN9wuCpgCNnzL9Wn3";

export function payPortsFromEnv(): PayPorts {
  const connection = rpcConnection();
  return {
    github: payGithub(githubApp()),
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

/**
 * Finds the repo and builds the ports to check a pay-page ping with, or null when GitHub doesn't know the repo.
 * The ping is only a hint to look: everything handleEvent acts on is read from GitHub and the chain.
 */
export async function checkPromiseFromEnv(ref: IssueRef): Promise<{ repo: RepoRef; ports: Ports } | null> {
  const app = githubApp();
  const found = await findRepoInstallation(app, ref.repo);
  if (!found) return null;

  const connection = rpcConnection();
  return {
    repo: found.repo,
    ports: {
      github: githubFor(app, found.installationId),
      chain: createChain({ arbiter: keypair("ARBITER_SECRET_KEY"), connection, send: sendWith(connection) }),
      appUrl: `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}`,
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
