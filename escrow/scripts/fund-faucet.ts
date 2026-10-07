// Mints test USDC into the pay page faucet's token account.
// Usage: npm run fund-faucet -- [whole USDC, default 1000]
// The operator key is the mint authority; the faucet key only needs to exist in .keys/faucet.json.
import { PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { connect, explorerTx, loadConfig, loadKeypair, KEYS_DIR } from "./lib";
import * as path from "path";

async function main() {
  const whole = Number(process.argv[2] ?? 1000);
  const { connection, operator } = connect();
  const { mint } = loadConfig();
  const faucet = loadKeypair(path.join(KEYS_DIR, "faucet.json"));

  const account = await getOrCreateAssociatedTokenAccount(
    connection,
    operator,
    new PublicKey(mint),
    faucet.publicKey
  );
  const sig = await mintTo(
    connection,
    operator,
    account.mint,
    account.address,
    operator,
    BigInt(whole) * 1_000_000n
  );
  console.log(`Minted ${whole} test USDC to the faucet ${faucet.publicKey}: ${explorerTx(sig)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
