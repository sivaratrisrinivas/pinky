import { createHash } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { createChain, PROGRAM_ID, projectAddress } from "./chain.js";

const ARBITER = Keypair.generate().publicKey;

function projectAccount(repoId: bigint, arbiter: PublicKey, discriminator = "Project") {
  const data = Buffer.alloc(8 + 8 + 32 * 3 + 8 + 2);
  createHash("sha256").update(`account:${discriminator}`).digest().copy(data, 0, 0, 8);
  data.writeBigUInt64LE(repoId, 8);
  arbiter.toBuffer().copy(data, 16);
  Keypair.generate().publicKey.toBuffer().copy(data, 48); // mint
  Keypair.generate().publicKey.toBuffer().copy(data, 80); // maintainer wallet
  data.writeBigUInt64LE(5_000_000n, 112);
  return { data };
}

function chainWith(accounts: Map<string, { data: Buffer }>) {
  return createChain({
    arbiter: ARBITER,
    connection: {
      async getAccountInfo(address: PublicKey) {
        return accounts.get(address.toBase58()) ?? null;
      },
    },
  });
}

describe("chain.readProject", () => {
  it("reads a project created with our arbiter", async () => {
    const address = projectAddress(PROGRAM_ID, 1407786691n);
    const chain = chainWith(new Map([[address.toBase58(), projectAccount(1407786691n, ARBITER)]]));

    expect(await chain.readProject(1407786691)).toEqual({ repoId: 1407786691 });
  });

  it("returns null when the repo has no project account", async () => {
    expect(await chainWith(new Map()).readProject(1407786691)).toBeNull();
  });

  it("returns null for a project that names someone else as arbiter", async () => {
    const address = projectAddress(PROGRAM_ID, 5n);
    const other = projectAccount(5n, Keypair.generate().publicKey);

    expect(await chainWith(new Map([[address.toBase58(), other]])).readProject(5)).toBeNull();
  });

  it("returns null for an account that isn't a Project", async () => {
    const address = projectAddress(PROGRAM_ID, 5n);
    const wrong = projectAccount(5n, ARBITER, "Promise");

    expect(await chainWith(new Map([[address.toBase58(), wrong]])).readProject(5)).toBeNull();
  });
});
