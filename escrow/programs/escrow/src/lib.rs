pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2nAVrgq7xYseUPES5ZUxfQ2pKcyWkiRJNxbgAWca7FCU");

#[program]
pub mod escrow {
    use super::*;

    pub fn init_project(
        ctx: Context<InitProject>,
        repo_id: u64,
        amount: u64,
        arbiter: Pubkey,
    ) -> Result<()> {
        instructions::init_project::handle_init_project(ctx, repo_id, amount, arbiter)
    }

    pub fn deposit(ctx: Context<Deposit>, issue_number: u64) -> Result<()> {
        instructions::deposit::handle_deposit(ctx, issue_number)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::handle_refund(ctx)
    }

    pub fn forfeit(ctx: Context<Forfeit>) -> Result<()> {
        instructions::forfeit::handle_forfeit(ctx)
    }

    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        instructions::reclaim::handle_reclaim(ctx)
    }
}
