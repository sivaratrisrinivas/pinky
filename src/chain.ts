import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import type { Chain } from "./handle-event.js";

export const PROGRAM_ID = new PublicKey("2nAVrgq7xYseUPES5ZUxfQ2pKcyWkiRJNxbgAWca7FCU");

const PROJECT_DISCRIMINATOR = createHash("sha256").update("account:Project").digest().subarray(0, 8);

// Project account layout, after the 8-byte discriminator: repo_id u64, arbiter,
// mint, maintainer_wallet, amount u64, bump u8, vault_bump u8.
const ARBITER_OFFSET = 8 + 8;

export interface AccountReader {
  getAccountInfo(address: PublicKey): Promise<{ data: Buffer | Uint8Array } | null>;
}

export function projectAddress(programId: PublicKey, repoId: bigint): PublicKey {
  const seed = Buffer.alloc(8);
  seed.writeBigUInt64LE(repoId);
  return PublicKey.findProgramAddressSync([Buffer.from("project"), seed], programId)[0];
}

export function createChain(options: {
  connection: AccountReader;
  /** Only projects naming this arbiter count: `init_project` is permissionless. */
  arbiter: PublicKey;
}): Chain {
  return {
    async readProject(repoId) {
      const account = await options.connection.getAccountInfo(
        projectAddress(PROGRAM_ID, BigInt(repoId))
      );
      if (!account) return null;

      const data = Buffer.from(account.data);
      if (!data.subarray(0, 8).equals(PROJECT_DISCRIMINATOR)) return null;
      const arbiter = new PublicKey(data.subarray(ARBITER_OFFSET, ARBITER_OFFSET + 32));
      if (!arbiter.equals(options.arbiter)) return null;

      return { repoId: Number(data.readBigUInt64LE(8)) };
    },
  };
}
