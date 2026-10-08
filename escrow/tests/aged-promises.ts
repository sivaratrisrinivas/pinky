// `reclaim` only works on promises older than 30 days, and a local validator
// cannot move its clock. So the validator starts with a few open promises that
// are already old, loaded from tests/fixtures/ (see [[test.validator.account]]
// in Anchor.toml). Each one belongs to a project the test creates itself,
// because a project's address depends only on its repo ID.
//
// Run `npm run fixtures` to regenerate the JSON after changing the Promise
// account layout. Nothing here is secret: the keys are derived from fixed seeds.
import { Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";

export const PROGRAM_ID = new PublicKey(
  "2nAVrgq7xYseUPES5ZUxfQ2pKcyWkiRJNxbgAWca7FCU"
);

export const AGED_ISSUE = 1;
export const AGED_AMOUNT = 5_000_000;
// Far older than 30 days on any clock.
export const AGED_CREATED_AT = 1;

function seeded(label: string): Keypair {
  return Keypair.fromSeed(createHash("sha256").update(label).digest());
}

export type AgedPromise = {
  name: string;
  repoId: number;
  mint: Keypair;
  promiser: Keypair;
  promiserToken: Keypair;
};

function aged(name: string, repoId: number): AgedPromise {
  return {
    name,
    repoId,
    mint: seeded(`pinky aged ${name} mint`),
    promiser: seeded(`pinky aged ${name} promiser`),
    promiserToken: seeded(`pinky aged ${name} promiser token`),
  };
}

export const AGED = {
  reclaimed: aged("reclaimed", 9001),
  notPromiser: aged("not-promiser", 9002),
  settled: aged("settled", 9003),
};

export function projectAddress(repoId: number): PublicKey {
  const repo = Buffer.alloc(8);
  repo.writeBigUInt64LE(BigInt(repoId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("project"), repo],
    PROGRAM_ID
  )[0];
}

export function promiseAddress(project: PublicKey, issue: number): PublicKey {
  const number = Buffer.alloc(8);
  number.writeBigUInt64LE(BigInt(issue));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("promise"), project.toBuffer(), number],
    PROGRAM_ID
  )[0];
}

/** Borsh bytes of an open Promise account, discriminator included. */
export function agedPromiseData(a: AgedPromise): Buffer {
  const project = projectAddress(a.repoId);
  const [, bump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("promise"),
      project.toBuffer(),
      (() => {
        const n = Buffer.alloc(8);
        n.writeBigUInt64LE(BigInt(AGED_ISSUE));
        return n;
      })(),
    ],
    PROGRAM_ID
  );
  const body = Buffer.alloc(32 + 8 + 32 + 32 + 8 + 1 + 8 + 1);
  let at = 0;
  project.toBuffer().copy(body, at);
  at += 32;
  body.writeBigUInt64LE(BigInt(AGED_ISSUE), at);
  at += 8;
  a.promiser.publicKey.toBuffer().copy(body, at);
  at += 32;
  a.promiserToken.publicKey.toBuffer().copy(body, at);
  at += 32;
  body.writeBigUInt64LE(BigInt(AGED_AMOUNT), at);
  at += 8;
  body.writeUInt8(0, at); // PromiseState::Open
  at += 1;
  body.writeBigInt64LE(BigInt(AGED_CREATED_AT), at);
  at += 8;
  body.writeUInt8(bump, at);
  const discriminator = createHash("sha256")
    .update("account:Promise")
    .digest()
    .subarray(0, 8);
  return Buffer.concat([discriminator, body]);
}
