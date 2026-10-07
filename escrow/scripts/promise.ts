// Makes a 5 test USDC promise for a real issue or PR number on the demo repo.
// Usage: npm run promise -- <issue-number>
import { PublicKey } from "@solana/web3.js";
import { connect, explorerAddress, explorerTx, loadConfig, makePromise } from "./lib";

async function main() {
  const issue = Number(process.argv[2]);
  if (!Number.isInteger(issue) || issue <= 0) {
    throw new Error("Usage: npm run promise -- <issue-number>");
  }

  const config = loadConfig();
  const { connection, operator, program } = connect();
  const { promise, promiserToken, depositSig } = await makePromise(
    connection,
    operator,
    program,
    config,
    issue
  );
  console.log(`Promise for ${config.repo}#${issue}: ${explorerAddress(promise)}`);
  console.log(`Transaction: ${explorerTx(depositSig)}`);
  console.log(`Promiser token account (gets the money back if kept): ${explorerAddress(new PublicKey(promiserToken))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
