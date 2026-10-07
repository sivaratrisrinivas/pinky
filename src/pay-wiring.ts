import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { App } from "octokit";
import { createChain, sendWith } from "./chain.js";
import { githubFor } from "./github.js";
import type { PinkyEvent, Ports } from "./handle-event.js";
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

/**
 * Turns the pay page's ping into an event and the ports to handle it with, or null when GitHub doesn't know
 * the issue. The ping is only a hint to look: everything handleEvent acts on is read from GitHub and the chain.
 */
export async function checkPromiseFromEnv(
  ref: IssueRef
): Promise<{ event: PinkyEvent; ports: Ports } | null> {
  const [owner, name] = ref.repo.split("/") as [string, string];
  const app = new App({
    appId: env("GITHUB_APP_ID"),
    privateKey: Buffer.from(env("GITHUB_APP_PRIVATE_KEY_BASE64"), "base64").toString("utf8"),
  });
  try {
    const { data: installation } = await app.octokit.rest.apps.getRepoInstallation({ owner, repo: name });
    const octokit = await app.getInstallationOctokit(installation.id);
    const { data: repository } = await octokit.rest.repos.get({ owner, repo: name });
    const connection = new Connection(process.env.RPC_URL ?? DEFAULT_RPC, "confirmed");
    return {
      event: {
        name: "check_promise",
        repo: { id: repository.id, full_name: repository.full_name },
        number: ref.number,
      },
      ports: {
        github: githubFor(app, installation.id),
        chain: createChain({ arbiter: keypair("ARBITER_SECRET_KEY"), connection, send: sendWith(connection) }),
        appUrl: `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}`,
      },
    };
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
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
