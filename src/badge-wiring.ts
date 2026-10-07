import { Connection, Keypair } from "@solana/web3.js";
import { App } from "octokit";
import type { BadgePorts } from "./badge.js";
import { createChain, sendWith } from "./chain.js";

const DEFAULT_RPC = "https://api.devnet.solana.com";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

/** Reads repo IDs as the installed App, which has a higher rate limit than anonymous calls. */
function githubRepoIds(app: App): BadgePorts["github"] {
  return {
    async getRepoId(repo) {
      const [owner, name] = repo.split("/");
      if (!owner || !name) return null;
      try {
        const { data: installation } = await app.octokit.rest.apps.getRepoInstallation({ owner, repo: name });
        const octokit = await app.getInstallationOctokit(installation.id);
        const { data } = await octokit.rest.repos.get({ owner, repo: name });
        return data.id;
      } catch (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
    },
  };
}

export function badgePortsFromEnv(): BadgePorts {
  const connection = new Connection(process.env.RPC_URL ?? DEFAULT_RPC, "confirmed");
  const app = new App({
    appId: env("GITHUB_APP_ID"),
    privateKey: Buffer.from(env("GITHUB_APP_PRIVATE_KEY_BASE64"), "base64").toString("utf8"),
  });
  const arbiter = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env("ARBITER_SECRET_KEY"))));
  return {
    github: githubRepoIds(app),
    chain: createChain({ arbiter, connection, send: sendWith(connection) }),
  };
}

/** Parses `owner/name`, or null when it is malformed. */
export function parseRepo(repo: unknown): string | null {
  return typeof repo === "string" && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : null;
}
