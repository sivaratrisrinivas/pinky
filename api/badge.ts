import { badgeFor } from "../src/badge.js";
import { badgePortsFromEnv, parseRepo } from "../src/badge-wiring.js";

export async function GET(request: Request): Promise<Response> {
  const repo = parseRepo(new URL(request.url).searchParams.get("repo"));
  if (!repo) return new Response("Pass ?repo=owner/name", { status: 400 });

  return new Response(await badgeFor(repo, badgePortsFromEnv()), {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
