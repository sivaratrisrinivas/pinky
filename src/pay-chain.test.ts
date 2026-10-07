import { createHash } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { PROGRAM_ID, projectAddress } from "./chain.js";
import { payChain } from "./pay-adapters.js";

const ARBITER = Keypair.generate().publicKey;
const MINT = Keypair.generate().publicKey;

function discriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function projectAccount(repoId: bigint, arbiter: PublicKey) {
  const data = Buffer.alloc(8 + 8 + 32 * 3 + 8 + 2);
  discriminator("Project").copy(data);
  data.writeBigUInt64LE(repoId, 8);
  arbiter.toBuffer().copy(data, 16);
  MINT.toBuffer().copy(data, 48);
  data.writeBigUInt64LE(5_000_000n, 112);
  return { data };
}

function reader(accounts: Map<string, { data: Buffer }>) {
  return {
    async getAccountInfo(address: PublicKey) {
      return accounts.get(address.toBase58()) ?? null;
    },
  };
}

describe("payChain.readProject", () => {
  const address = projectAddress(PROGRAM_ID, 42n);

  it("reads the mint and amount of our project", async () => {
    const chain = payChain({
      arbiter: ARBITER,
      connection: reader(new Map([[address.toBase58(), projectAccount(42n, ARBITER)]])),
    });
    const project = await chain.readProject(42);
    expect(project).toMatchObject({ repoId: 42, amount: 5_000_000n });
    expect(project?.address.equals(address)).toBe(true);
    expect(project?.mint.equals(MINT)).toBe(true);
  });

  it("ignores a project that names a different arbiter", async () => {
    const chain = payChain({
      arbiter: ARBITER,
      connection: reader(new Map([[address.toBase58(), projectAccount(42n, Keypair.generate().publicKey)]])),
    });
    expect(await chain.readProject(42)).toBeNull();
  });

  it("returns null when there is no project", async () => {
    const chain = payChain({ arbiter: ARBITER, connection: reader(new Map()) });
    expect(await chain.readProject(42)).toBeNull();
  });
});

describe("payChain.promiseExists", () => {
  it("is true only when a Promise account sits at the promise address", async () => {
    const [promise] = PublicKey.findProgramAddressSync(
      [Buffer.from("promise"), projectAddress(PROGRAM_ID, 42n).toBuffer(), Buffer.from([7, 0, 0, 0, 0, 0, 0, 0])],
      PROGRAM_ID
    );
    const data = Buffer.alloc(130);
    discriminator("Promise").copy(data);
    const chain = payChain({
      arbiter: ARBITER,
      connection: reader(new Map([[promise.toBase58(), { data }]])),
    });
    expect(await chain.promiseExists(42, 7)).toBe(true);
    expect(await chain.promiseExists(42, 8)).toBe(false);
  });
});
