// Sets up a GitHub repo as a Pinky project on devnet.
// Usage: npm run setup-project -- <owner/repo>
// Safe to re-run: it reuses the mint, arbiter and project it already made.
import { BN } from "@anchor-lang/core";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import * as fs from "fs";
import {
  AMOUNT,
  configFile,
  connect,
  explorerAddress,
  explorerTx,
  KEYS_DIR,
  loadOrCreateKey,
  projectAddress,
} from "./lib";

async function githubRepoId(repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub: ${repo} -> HTTP ${res.status}`);
  return String(((await res.json()) as { id: number }).id);
}

async function main() {
  const repo = process.argv[2];
  if (!repo || !repo.includes("/")) {
    throw new Error("Usage: npm run setup-project -- <owner/repo>");
  }
  const { connection, operator, program } = connect();
  const arbiter = loadOrCreateKey("arbiter");
  const mintKey = loadOrCreateKey("mint");
  const repoId = new BN(await githubRepoId(repo));
  const project = projectAddress(program.programId, repoId);

  if (!(await connection.getAccountInfo(mintKey.publicKey))) {
    await createMint(connection, operator, operator.publicKey, null, 6, mintKey);
  }
  const maintainerWallet = await getOrCreateAssociatedTokenAccount(
    connection,
    operator,
    mintKey.publicKey,
    operator.publicKey
  );

  if (await connection.getAccountInfo(project)) {
    console.log("Project already exists, leaving it as is.");
  } else {
    const sig = await program.methods
      .initProject(repoId, new BN(AMOUNT), arbiter.publicKey)
      .accountsPartial({
        mint: mintKey.publicKey,
        maintainerWallet: maintainerWallet.address,
      })
      .rpc();
    console.log(`init_project: ${explorerTx(sig)}`);
  }

  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(
    configFile,
    JSON.stringify(
      {
        repo,
        repoId: repoId.toString(),
        mint: mintKey.publicKey.toString(),
        maintainerWallet: maintainerWallet.address.toString(),
        project: project.toString(),
        arbiter: arbiter.publicKey.toString(),
      },
      null,
      2
    )
  );
  console.log(`Project ${repo} (repo ID ${repoId}): ${explorerAddress(project)}`);
  console.log(`Arbiter public key: ${arbiter.publicKey}`);
  console.log(`Test USDC mint: ${mintKey.publicKey}`);
  console.log(`Maintainer wallet: ${maintainerWallet.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
