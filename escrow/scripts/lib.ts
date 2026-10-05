import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import idl from "../target/idl/escrow.json";
import { Escrow } from "../target/types/escrow";

export const KEYS_DIR = path.join(__dirname, "..", ".keys");
export const AMOUNT = 5_000_000; // 5 test USDC, 6 decimals
export const DEVNET_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

export function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8")))
  );
}

/** Loads a keypair from `.keys/<name>.json`, creating it on first use. */
export function loadOrCreateKey(name: string): Keypair {
  const file = path.join(KEYS_DIR, `${name}.json`);
  if (fs.existsSync(file)) return loadKeypair(file);
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const key = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify(Array.from(key.secretKey)), {
    mode: 0o600,
  });
  return key;
}

export function operatorKey(): Keypair {
  return loadKeypair(
    process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json")
  );
}

export function connect() {
  const connection = new Connection(DEVNET_URL, "confirmed");
  const operator = operatorKey();
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(operator),
    { commitment: "confirmed" }
  );
  const program = new Program<Escrow>(idl as Escrow, provider);
  return { connection, operator, provider, program };
}

export function projectAddress(programId: PublicKey, repoId: BN): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("project"), repoId.toArrayLike(Buffer, "le", 8)],
    programId
  )[0];
}

export function promiseAddress(
  programId: PublicKey,
  project: PublicKey,
  issue: BN
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("promise"), project.toBuffer(), issue.toArrayLike(Buffer, "le", 8)],
    programId
  )[0];
}

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

export const explorerAddress = (address: PublicKey | string) =>
  `https://explorer.solana.com/address/${address.toString()}?cluster=devnet`;

export interface DevnetConfig {
  repo: string;
  repoId: string;
  mint: string;
  maintainerWallet: string;
  project: string;
  arbiter: string;
}

export const configFile = path.join(KEYS_DIR, "devnet.json");

export function loadConfig(): DevnetConfig {
  if (!fs.existsSync(configFile)) {
    throw new Error("No .keys/devnet.json. Run `npm run setup-project` first.");
  }
  return JSON.parse(fs.readFileSync(configFile, "utf8"));
}
