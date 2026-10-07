import { createHash } from "node:crypto";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PROGRAM_ID, promiseAddress } from "./chain.js";
import type { PayProject } from "./pay.js";

const DEPOSIT_DISCRIMINATOR = createHash("sha256").update("global:deposit").digest().subarray(0, 8);

function u64(value: number | bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

export function buildDepositTransaction(options: {
  wallet: PublicKey;
  project: PayProject;
  issueNumber: number;
  blockhash: string;
}): Transaction {
  const { wallet, project, issueNumber } = options;
  const walletToken = getAssociatedTokenAddressSync(project.mint, wallet);
  const promise = promiseAddress(PROGRAM_ID, project.address, BigInt(issueNumber));
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), project.address.toBuffer()],
    PROGRAM_ID
  );

  const deposit = new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.concat([DEPOSIT_DISCRIMINATOR, u64(issueNumber)]),
    keys: [
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: project.address, isSigner: false, isWritable: false },
      { pubkey: promise, isSigner: false, isWritable: true },
      { pubkey: walletToken, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });

  return new Transaction({ feePayer: wallet, recentBlockhash: options.blockhash }).add(
    createAssociatedTokenAccountIdempotentInstruction(
      wallet,
      walletToken,
      wallet,
      project.mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    ),
    deposit
  );
}
