import { checkPromise } from "../src/handle-event.js";
import { checkPromiseFromEnv, json, parseIssueRef } from "../src/pay-wiring.js";

/**
 * The pay page's ping after a promise. It proves nothing; the promise is read from the chain. `found` says whether
 * the chain had it yet, so the page can ask again when the RPC lags behind the transaction it just confirmed.
 */
export async function POST(request: Request): Promise<Response> {
  const { repo, n } = (await request.json().catch(() => ({}))) as { repo?: unknown; n?: unknown };
  const ref = parseIssueRef(repo, n);
  if (!ref) return json({ error: "Pass { repo: 'owner/name', n: <issue number> }" }, 400);

  const resolved = await checkPromiseFromEnv(ref);
  if (!resolved) return json({ error: "Unknown issue" }, 404);

  const result = await checkPromise({ repo: resolved.repo, number: ref.number }, resolved.ports);
  return json({ ok: true, found: result === "found" });
}
