use anchor_lang::prelude::*;

#[constant]
pub const PROJECT_SEED: &[u8] = b"project";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const PROMISE_SEED: &[u8] = b"promise";

/// How long a promise must stay open before its promiser can reclaim it (30 days).
#[constant]
pub const RECLAIM_AFTER_SECONDS: i64 = 30 * 24 * 60 * 60;
