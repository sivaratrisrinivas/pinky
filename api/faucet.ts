import { InvalidWalletError, requestFaucet } from "../src/pay.js";
import { json, payPortsFromEnv } from "../src/pay-wiring.js";

export async function POST(request: Request): Promise<Response> {
  const { wallet } = (await request.json().catch(() => ({}))) as { wallet?: unknown };
  if (typeof wallet !== "string") return json({ error: "Pass { wallet }" }, 400);
  try {
    return json(await requestFaucet(wallet, payPortsFromEnv()));
  } catch (error) {
    if (error instanceof InvalidWalletError) {
      return json({ error: error.message }, 400);
    }
    throw error;
  }
}
