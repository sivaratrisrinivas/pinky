import { writeFileSync } from "fs";
import { join } from "path";
import {
  AGED,
  PROGRAM_ID,
  AGED_ISSUE,
  agedPromiseData,
  projectAddress,
  promiseAddress,
} from "../tests/aged-promises";

for (const a of Object.values(AGED)) {
  const address = promiseAddress(projectAddress(a.repoId), AGED_ISSUE);
  const file = join(__dirname, "../tests/fixtures", `aged-${a.name}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        pubkey: address.toBase58(),
        account: {
          lamports: 10_000_000,
          data: [agedPromiseData(a).toString("base64"), "base64"],
          owner: PROGRAM_ID.toBase58(),
          executable: false,
          rentEpoch: 0,
          space: agedPromiseData(a).length,
        },
      },
      null,
      2
    ) + "\n"
  );
  console.log(`${a.name}: ${address.toBase58()} -> ${file}`);
}
