import type { Chain } from "./handle-event.js";

export interface BadgePorts {
  github: {
    /** The GitHub repo ID for `owner/name`, or null when GitHub doesn't know the repo. */
    getRepoId(repo: string): Promise<number | null>;
  };
  chain: Pick<Chain, "countPromises">;
}

const LABEL = "Pinky-protected";
const CHAR_WIDTH = 6.6;
const PADDING = 10;

function textWidth(text: string): number {
  return Math.ceil(text.length * CHAR_WIDTH) + PADDING * 2;
}

function svgBadge(label: string, value: string, color: string): string {
  const labelWidth = textWidth(label);
  const valueWidth = textWidth(value);
  const width = labelWidth + valueWidth;
  const text = (content: string, centre: number) =>
    `<text x="${centre}" y="14">${content}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${value}">` +
    `<title>${label}: ${value}</title>` +
    `<clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#555"/>` +
    `<rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">` +
    `${text(label, labelWidth / 2)}${text(value, labelWidth + valueWidth / 2)}</g></svg>`
  );
}

/** The README badge: "Pinky-protected: N promises, M broken". */
export function renderBadge(counts: { promises: number; broken: number }): string {
  return svgBadge(LABEL, `${counts.promises} promises, ${counts.broken} broken`, "#4c1");
}

/** The badge for a repo, with counts read from the chain. A repo that isn't a project gets a grey 404 badge. */
export async function badgeFor(repo: string, ports: BadgePorts): Promise<{ status: 200 | 404; svg: string }> {
  const repoId = await ports.github.getRepoId(repo);
  const counts = repoId === null ? null : await ports.chain.countPromises(repoId);
  if (!counts) return { status: 404, svg: svgBadge(LABEL, "not set up", "#9f9f9f") };
  return { status: 200, svg: renderBadge(counts) };
}
