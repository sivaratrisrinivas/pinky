import { describe, expect, it } from "vitest";
import { badgeFor, renderBadge, type BadgePorts } from "./badge.js";

const textOf = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe("renderBadge", () => {
  it("is an SVG reading Pinky-protected: N promises, M broken", () => {
    const svg = renderBadge({ promises: 12, broken: 3 });

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('aria-label="Pinky-protected: 12 promises, 3 broken"');
    expect(textOf(svg)).toContain("Pinky-protected");
    expect(textOf(svg)).toContain("12 promises, 3 broken");
  });

  it("shows zeros for a project nobody has promised to yet", () => {
    expect(textOf(renderBadge({ promises: 0, broken: 0 }))).toContain("0 promises, 0 broken");
  });

  it("grows wider with the text so larger counts still fit", () => {
    const width = (svg: string) => Number(/<svg[^>]* width="(\d+)"/.exec(svg)?.[1]);

    expect(width(renderBadge({ promises: 1234, broken: 567 }))).toBeGreaterThan(
      width(renderBadge({ promises: 1, broken: 0 }))
    );
  });
});

function ports(options: { repoId?: number | null; counts?: { promises: number; broken: number } | null }) {
  const asked: number[] = [];
  const badgePorts: BadgePorts = {
    github: {
      async getRepoId() {
        return options.repoId === undefined ? 42 : options.repoId;
      },
    },
    chain: {
      async countPromises(repoId) {
        asked.push(repoId);
        return options.counts === undefined ? { promises: 4, broken: 1 } : options.counts;
      },
    },
  };
  return { badgePorts, asked };
}

describe("badgeFor", () => {
  it("renders the counts the chain reports for the repo", async () => {
    const { badgePorts, asked } = ports({ counts: { promises: 7, broken: 2 } });

    const badge = await badgeFor("acme/widgets", badgePorts);

    expect(badge.status).toBe(200);
    expect(textOf(badge.svg)).toContain("7 promises, 2 broken");
    expect(asked).toEqual([42]);
  });

  it("reflects a new count on the next request", async () => {
    let promises = 2;
    const badgePorts: BadgePorts = {
      github: { getRepoId: async () => 42 },
      chain: { countPromises: async () => ({ promises, broken: 0 }) },
    };

    expect(textOf((await badgeFor("acme/widgets", badgePorts)).svg)).toContain("2 promises, 0 broken");
    promises = 3;
    expect(textOf((await badgeFor("acme/widgets", badgePorts)).svg)).toContain("3 promises, 0 broken");
  });

  it("says the repo isn't set up when it isn't a project", async () => {
    const { badgePorts } = ports({ counts: null });

    const badge = await badgeFor("acme/widgets", badgePorts);

    expect(badge.status).toBe(404);
    expect(textOf(badge.svg)).toContain("not set up");
  });

  it("says the repo isn't set up when GitHub doesn't know it, without asking the chain", async () => {
    const { badgePorts, asked } = ports({ repoId: null });

    const badge = await badgeFor("acme/widgets", badgePorts);

    expect(badge.status).toBe(404);
    expect(asked).toEqual([]);
  });
});
