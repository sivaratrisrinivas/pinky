import { payStatus } from "../src/pay.js";
import { json, parseIssueRef, payPortsFromEnv, phantomAppId } from "../src/pay-wiring.js";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const ref = parseIssueRef(params.get("repo"), params.get("n"));
  if (!ref) return json({ error: "Pass ?repo=owner/name&n=<issue number>" }, 400);

  const status = await payStatus(ref, payPortsFromEnv());
  return json({ ...status, phantomAppId: phantomAppId() });
}
