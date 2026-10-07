import { env, githubApp, keypair, rpcConnection } from "../src/app-env.js";
import { createChain, sendWith } from "../src/chain.js";
import { githubFor } from "../src/github.js";
import { handleEvent, type WebhookEvent } from "../src/handle-event.js";
import { verifySignature } from "../src/signature.js";

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

  const connection = rpcConnection();
  await handleEvent(event, {
    github: githubFor(githubApp(), installationId),
    chain: createChain({ arbiter: keypair("ARBITER_SECRET_KEY"), connection, send: sendWith(connection) }),
    appUrl: `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}`,
  });
  return new Response("OK");
}
