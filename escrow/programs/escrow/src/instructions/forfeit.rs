use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use super::settle::settle;
use crate::{
    constants::*,
    error::ErrorCode,
    state::{Project, Promise, PromiseState},
};

#[derive(Accounts)]
pub struct Forfeit<'info> {
    #[account(address = project.arbiter @ ErrorCode::NotArbiter)]
    pub arbiter: Signer<'info>,
    pub project: Account<'info, Project>,
    #[account(mut, has_one = project)]
    pub promise: Account<'info, Promise>,
    #[account(
        mut,
        seeds = [VAULT_SEED, project.key().as_ref()],
        bump = project.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, address = project.maintainer_wallet)]
    pub maintainer_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_forfeit(ctx: Context<Forfeit>) -> Result<()> {
    let accounts = ctx.accounts;
    settle(
        &accounts.project,
        &mut accounts.promise,
        &accounts.vault,
        &accounts.maintainer_wallet,
        &accounts.token_program,
        PromiseState::Broken,
    )
}
