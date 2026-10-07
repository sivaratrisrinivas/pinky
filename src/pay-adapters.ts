import { createHash } from "node:crypto";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { App } from "octokit";
import { PROGRAM_ID, projectAddress, promiseAddress } from "./chain.js";
import type { PayPorts, PayProject } from "./pay.js";

interface AccountReader {
  getAccountInfo(address: PublicKey): Promise<{ data: Buffer | Uint8Array } | null>;
}

const PROJECT_DISCRIMINATOR = createHash("sha256").update("account:Project").digest().subarray(0, 8);
const PROMISE_DISCRIMINATOR = createHash("sha256").update("account:Promise").digest().subarray(0, 8);

// Project layout after the 8-byte discriminator: repo_id u64, arbiter, mint, maintainer_wallet, amount u64.
const ARBITER_OFFSET = 16;
const MINT_OFFSET = 48;
const AMOUNT_OFFSET = 112;

export function payChain(options: {
  connection: AccountReader;
  /** Only projects naming this arbiter count: `init_project` is permissionless. */
  arbiter: PublicKey;
}): PayPorts["chain"] {
  return {
    async readProject(repoId) {
      const address = projectAddress(PROGRAM_ID, BigInt(repoId));
      const account = await options.connection.getAccountInfo(address);
      if (!account) return null;

      const data = Buffer.from(account.data);
      if (!data.subarray(0, 8).equals(PROJECT_DISCRIMINATOR)) return null;
      const arbiter = new PublicKey(data.subarray(ARBITER_OFFSET, ARBITER_OFFSET + 32));
      if (!arbiter.equals(options.arbiter)) return null;

      const project: PayProject = {
        repoId,
        address,
        mint: new PublicKey(data.subarray(MINT_OFFSET, MINT_OFFSET + 32)),
        amount: data.readBigUInt64LE(AMOUNT_OFFSET),
      };
      return project;
    },
    async promiseExists(repoId, issueNumber) {
      const project = projectAddress(PROGRAM_ID, BigInt(repoId));
      const promise = promiseAddress(PROGRAM_ID, project, BigInt(issueNumber));
      const account = await options.connection.getAccountInfo(promise);
      return account !== null && Buffer.from(account.data).subarray(0, 8).equals(PROMISE_DISCRIMINATOR);
    },
  };
}

/** Reads issues as the installed App, which has a higher rate limit than anonymous calls. */
export function payGithub(app: App): PayPorts["github"] {
  return {
    async getIssue(repo, number) {
      const [owner, name] = repo.split("/");
      if (!owner || !name) return null;
      try {
        const { data: installation } = await app.octokit.rest.apps.getRepoInstallation({ owner, repo: name });
        const octokit = await app.getInstallationOctokit(installation.id);
        const { data: issue } = await octokit.rest.issues.get({ owner, repo: name, issue_number: number });
        const { data: repository } = await octokit.rest.repos.get({ owner, repo: name });
        return { repoId: repository.id, state: issue.state === "closed" ? "closed" : "open" };
      } catch (error) {
        if ((error as { status?: number }).status === 404) return null;
        throw error;
      }
    },
  };
}

export function payFaucet(options: {
  connection: Connection;
  faucet: Keypair;
  mint: PublicKey;
}): PayPorts["faucet"] {
  const { connection, faucet, mint } = options;
  const tokenAccount = (owner: PublicKey) => getAssociatedTokenAddressSync(mint, owner);

  return {
    async balances(wallet) {
      const lamports = BigInt(await connection.getBalance(wallet));
      const address = tokenAccount(wallet);
      // Only a missing token account counts as zero: an RPC failure must not make the faucet over-send.
      const usdc = (await connection.getAccountInfo(address))
        ? BigInt((await connection.getTokenAccountBalance(address)).value.amount)
        : 0n;
      return { lamports, usdc };
    },
    async send({ wallet, usdc, lamports }) {
      const transaction = new Transaction();
      if (lamports > 0n) {
        transaction.add(
          SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: wallet, lamports })
        );
      }
      if (usdc > 0n) {
        const destination = tokenAccount(wallet);
        transaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            faucet.publicKey,
            destination,
            wallet,
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          ),
          createTransferInstruction(tokenAccount(faucet.publicKey), destination, faucet.publicKey, usdc)
        );
      }
      return sendAndConfirmTransaction(connection, transaction, [faucet]);
    },
  };
}
