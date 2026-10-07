import { handleEvent } from "../src/handle-event.js";
import { checkPromiseFromEnv, json, parseIssueRef } from "../src/pay-wiring.js";

/** The pay page's ping after a deposit. It proves nothing; handleEvent reads the promise from the chain. */
export async function POST(request: Request): Promise<Response> {
  const { repo, n } = (await request.json().catch(() => ({}))) as { repo?: unknown; n?: unknown };
  const ref = parseIssueRef(repo, n);
  if (!ref) return json({ error: "Pass { repo: 'owner/name', n: <issue number> }" }, 400);

  const resolved = await checkPromiseFromEnv(ref);
  if (!resolved) return json({ error: "Unknown issue" }, 404);

  await handleEvent(resolved.event, resolved.ports);
  return json({ ok: true });
}
