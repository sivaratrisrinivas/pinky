import { createHash } from "node:crypto";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  type Connection,
  type GetProgramAccountsFilter,
  type Keypair,
} from "@solana/web3.js";
import type { Chain, Outcome, PromiseRecord } from "./handle-event.js";

export const PROGRAM_ID = new PublicKey("2nAVrgq7xYseUPES5ZUxfQ2pKcyWkiRJNxbgAWca7FCU");

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const discriminator = (preimage: string) =>
  createHash("sha256").update(preimage).digest().subarray(0, 8);

const PROJECT_DISCRIMINATOR = discriminator("account:Project");
const PROMISE_DISCRIMINATOR = discriminator("account:Promise");
const INSTRUCTION_DISCRIMINATORS: Record<Outcome, Buffer> = {
  kept: discriminator("global:refund"),
  broken: discriminator("global:forfeit"),
};

// Project account layout, after the 8-byte discriminator: repo_id u64, arbiter,
// mint, maintainer_wallet, amount u64, bump u8, vault_bump u8.
const ARBITER_OFFSET = 8 + 8;
const MAINTAINER_WALLET_OFFSET = 8 + 8 + 32 + 32;

// Promise layout, after the discriminator: project, issue_number u64, promiser,
// promiser_token, amount u64, state u8, created_at i64, bump u8.
const PROMISER_TOKEN_OFFSET = 8 + 32 + 8 + 32;
const PROMISE_STATE_OFFSET = 8 + 32 + 8 + 32 + 32 + 8;
const PROMISE_ACCOUNT_SIZE = 8 + 32 + 8 + 32 + 32 + 8 + 1 + 8 + 1;
const PROMISE_PROJECT_OFFSET = 8;
const PROMISE_STATES = ["open", "kept", "broken"] as const;

export interface Rpc {
  getAccountInfo(address: PublicKey): Promise<{ data: Buffer | Uint8Array } | null>;
  getSignaturesForAddress(
    address: PublicKey,
    options: { limit: number }
  ): Promise<{ signature: string; err: unknown }[]>;
  getProgramAccounts: (
    programId: PublicKey,
    config: { filters: GetProgramAccountsFilter[] }
  ) => Promise<readonly { account: { data: Buffer | Uint8Array } }[]>;
}

/** Signs one instruction with `signer` and waits for it to confirm. */
export type Send = (instruction: TransactionInstruction, signer: Keypair) => Promise<string>;

export function sendWith(connection: Connection): Send {
  return (instruction, signer) =>
    sendAndConfirmTransaction(connection, new Transaction().add(instruction), [signer]);
}

function u64Seed(value: bigint): Buffer {
  const seed = Buffer.alloc(8);
  seed.writeBigUInt64LE(value);
  return seed;
}

export function projectAddress(programId: PublicKey, repoId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("project"), u64Seed(repoId)], programId)[0];
}

export function promiseAddress(programId: PublicKey, project: PublicKey, issueNumber: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("promise"), project.toBuffer(), u64Seed(issueNumber)],
    programId
  )[0];
}

function vaultAddress(programId: PublicKey, project: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), project.toBuffer()], programId)[0];
}

const SETTLEMENT_LOOKBACK = 10;

export function createChain(options: {
  connection: Rpc;
  /** Only projects naming this arbiter count: `init_project` is permissionless. */
  arbiter: Keypair;
  send: Send;
}): Chain {
  const { connection, arbiter, send } = options;

  async function readAccount(address: PublicKey, kind: Buffer): Promise<Buffer | null> {
    const account = await connection.getAccountInfo(address);
    if (!account) return null;
    const data = Buffer.from(account.data);
    return data.subarray(0, 8).equals(kind) ? data : null;
  }

  async function readProjectData(repoId: number): Promise<Buffer | null> {
    const data = await readAccount(projectAddress(PROGRAM_ID, BigInt(repoId)), PROJECT_DISCRIMINATOR);
    if (!data) return null;
    const projectArbiter = new PublicKey(data.subarray(ARBITER_OFFSET, ARBITER_OFFSET + 32));
    return projectArbiter.equals(arbiter.publicKey) ? data : null;
  }

  async function settlementTx(promise: PublicKey): Promise<string | null> {
    const signatures = await connection.getSignaturesForAddress(promise, { limit: SETTLEMENT_LOOKBACK });
    return signatures.find((s) => s.err === null)?.signature ?? null;
  }

  return {
    async readProject(repoId) {
      const data = await readProjectData(repoId);
      return data && { repoId: Number(data.readBigUInt64LE(8)) };
    },

    async readPromise(repoId, issueNumber): Promise<PromiseRecord | null> {
      const address = promiseAddress(
        PROGRAM_ID,
        projectAddress(PROGRAM_ID, BigInt(repoId)),
        BigInt(issueNumber)
      );
      const data = await readAccount(address, PROMISE_DISCRIMINATOR);
      if (!data) return null;

      const state = PROMISE_STATES[data.readUInt8(PROMISE_STATE_OFFSET)];
      if (!state) throw new Error(`Promise ${address} has an unknown state`);
      return state === "open" ? { state } : { state, settlementTx: await settlementTx(address) };
    },

    async countPromises(repoId) {
      if (!(await readProjectData(repoId))) return null;

      const project = projectAddress(PROGRAM_ID, BigInt(repoId));
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { dataSize: PROMISE_ACCOUNT_SIZE },
          { memcmp: { offset: PROMISE_PROJECT_OFFSET, bytes: project.toBase58() } },
        ],
      });
      const promises = accounts
        .map(({ account }) => Buffer.from(account.data))
        .filter((data) => data.subarray(0, 8).equals(PROMISE_DISCRIMINATOR));
      const broken = promises.filter((data) => PROMISE_STATES[data.readUInt8(PROMISE_STATE_OFFSET)] === "broken");
      return { promises: promises.length, broken: broken.length };
    },

    async settle(repoId, issueNumber, outcome) {
      const projectData = await readProjectData(repoId);
      if (!projectData) throw new Error(`No project of ours for repo ${repoId}`);

      const project = projectAddress(PROGRAM_ID, BigInt(repoId));
      const promise = promiseAddress(PROGRAM_ID, project, BigInt(issueNumber));
      const promiseData = await readAccount(promise, PROMISE_DISCRIMINATOR);
      if (!promiseData) throw new Error(`No promise for issue ${issueNumber} of repo ${repoId}`);

      const destination = new PublicKey(
        outcome === "kept"
          ? promiseData.subarray(PROMISER_TOKEN_OFFSET, PROMISER_TOKEN_OFFSET + 32)
          : projectData.subarray(MAINTAINER_WALLET_OFFSET, MAINTAINER_WALLET_OFFSET + 32)
      );

      return send(
        new TransactionInstruction({
          programId: PROGRAM_ID,
          data: INSTRUCTION_DISCRIMINATORS[outcome],
          keys: [
            { pubkey: arbiter.publicKey, isSigner: true, isWritable: false },
            { pubkey: project, isSigner: false, isWritable: false },
            { pubkey: promise, isSigner: false, isWritable: true },
            { pubkey: vaultAddress(PROGRAM_ID, project), isSigner: false, isWritable: true },
            { pubkey: destination, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
        }),
        arbiter
      );
    },
  };
}
