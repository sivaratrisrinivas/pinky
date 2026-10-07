import type { App } from "octokit";
import { findRepoInstallation, githubApp, keypair, rpcConnection } from "./app-env.js";
import type { BadgePorts } from "./badge.js";
import { createChain, sendWith } from "./chain.js";

/** Reads repo IDs as the installed App, which has a higher rate limit than anonymous calls. */
function githubRepoIds(app: App): BadgePorts["github"] {
  return {
    async getRepoId(repo) {
      return (await findRepoInstallation(app, repo))?.repo.id ?? null;
    },
  };
}

export function badgePortsFromEnv(): BadgePorts {
  const connection = rpcConnection();
  return {
    github: githubRepoIds(githubApp()),
    chain: createChain({ arbiter: keypair("ARBITER_SECRET_KEY"), connection, send: sendWith(connection) }),
  };
}

/** Parses `owner/name`, or null when it is malformed. */
export function parseRepo(repo: unknown): string | null {
  return typeof repo === "string" && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : null;
}
