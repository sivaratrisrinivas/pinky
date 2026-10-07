use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Promise amount must be greater than zero")]
    ZeroAmount,
    #[msg("Only the project's arbiter can settle a promise")]
    NotArbiter,
    #[msg("This promise is already settled")]
    PromiseSettled,
    #[msg("Only the promiser can reclaim a promise")]
    NotPromiser,
    #[msg("A promise can only be reclaimed after 30 days")]
    TooEarlyToReclaim,
}
