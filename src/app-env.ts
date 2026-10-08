import { Connection, Keypair } from "@solana/web3.js";
import { App, type Octokit } from "octokit";
import type { RepoRef } from "./handle-event.js";

const DEFAULT_RPC = "https://api.devnet.solana.com";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

/** A keypair stored in an env var as a JSON array of bytes. */
export function keypair(name: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env(name))));
}

export function rpcConnection(): Connection {
  return new Connection(process.env.RPC_URL ?? DEFAULT_RPC, "confirmed");
}

/** The Pinky GitHub App, authenticated from the environment. */
export function githubApp(): App {
  return new App({
    appId: env("GITHUB_APP_ID"),
    privateKey: Buffer.from(env("GITHUB_APP_PRIVATE_KEY_BASE64"), "base64").toString("utf8"),
  });
}

/**
 * Finds the App's installation on `owner/name`, with an Octokit acting as that installation. Reads made this way
 * get the App's rate limit instead of the anonymous one. Null when the repo is malformed, unknown or not installed.
 */
export async function findRepoInstallation(
  app: App,
  fullName: string
): Promise<{ installationId: number; octokit: Octokit; repo: RepoRef } | null> {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return null;
  try {
    const { data: installation } = await app.octokit.rest.apps.getRepoInstallation({ owner, repo: name });
    const octokit = await app.getInstallationOctokit(installation.id);
    const { data } = await octokit.rest.repos.get({ owner, repo: name });
    return { installationId: installation.id, octokit, repo: { id: data.id, full_name: data.full_name } };
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}
