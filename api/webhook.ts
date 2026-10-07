import { Keypair, Connection } from "@solana/web3.js";
import { App } from "octokit";
import { createChain, sendWith } from "../src/chain.js";
import { githubFor } from "../src/github.js";
import { handleEvent, type WebhookEvent } from "../src/handle-event.js";
import { verifySignature } from "../src/signature.js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!verifySignature(env("GITHUB_WEBHOOK_SECRET"), body, request.headers.get("x-hub-signature-256"))) {
    return new Response("Bad signature", { status: 401 });
  }

  const name = request.headers.get("x-github-event");
  if (name !== "issues" && name !== "pull_request" && name !== "issue_comment") {
    return new Response("Ignored", { status: 202 });
  }
  const event = { name, payload: JSON.parse(body) } as WebhookEvent;
  const installationId = event.payload.installation?.id;
  if (installationId === undefined) return new Response("No installation", { status: 400 });

  const app = new App({
    appId: env("GITHUB_APP_ID"),
    privateKey: Buffer.from(env("GITHUB_APP_PRIVATE_KEY_BASE64"), "base64").toString("utf8"),
  });
  const arbiter = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env("ARBITER_SECRET_KEY"))));

  const connection = new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
  await handleEvent(event, {
    github: githubFor(app, installationId),
    chain: createChain({ arbiter, connection, send: sendWith(connection) }),
    appUrl: `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}`,
  });
  return new Response("OK");
}
