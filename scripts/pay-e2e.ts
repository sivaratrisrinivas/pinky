// Plays the pay page against devnet with a throwaway wallet standing in for the embedded wallet.
// Usage: npm run pay-e2e -- <owner/repo> <issue number>
// Reads the same env as the Vercel functions (run with --env-file=.env).
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { payStatus, prepareDeposit, requestFaucet } from "../src/pay.js";
import { payPortsFromEnv } from "../src/pay-wiring.js";

const [repo, issue] = process.argv.slice(2);
if (!repo || !issue) throw new Error("Usage: pay-e2e <owner/repo> <issue number>");
const number = Number(issue);

const ports = payPortsFromEnv();
const connection = new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const wallet = Keypair.generate();

console.log("status before:", await payStatus({ repo, number }, ports));
console.log("fresh wallet:", wallet.publicKey.toBase58());
console.log("faucet:", await requestFaucet(wallet.publicKey.toBase58(), ports));
console.log("faucet again:", await requestFaucet(wallet.publicKey.toBase58(), ports));

const prepared = await prepareDeposit({ repo, number, wallet: wallet.publicKey.toBase58() }, ports);
if (prepared.state !== "ready") throw new Error(`Not ready: ${prepared.state}`);
const transaction = Transaction.from(Buffer.from(prepared.transaction, "base64"));
transaction.partialSign(wallet);
const signature = await connection.sendRawTransaction(transaction.serialize());
await connection.confirmTransaction(signature, "confirmed");
console.log(`promise: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
console.log("status after:", await payStatus({ repo, number }, ports));
