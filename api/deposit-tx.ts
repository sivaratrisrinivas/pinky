import { InvalidWalletError, prepareDeposit } from "../src/pay.js";
import { json, parseIssueRef, payPortsFromEnv } from "../src/pay-wiring.js";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { repo?: unknown; n?: unknown; wallet?: unknown };
  const ref = parseIssueRef(body.repo, body.n);
  if (!ref || typeof body.wallet !== "string") return json({ error: "Pass { repo, n, wallet }" }, 400);
  try {
    return json(await prepareDeposit({ ...ref, wallet: body.wallet }, payPortsFromEnv()));
  } catch (error) {
    if (error instanceof InvalidWalletError) {
      return json({ error: error.message }, 400);
    }
    throw error;
  }
}
