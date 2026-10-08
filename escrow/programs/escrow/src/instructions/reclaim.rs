use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

use super::settle::settle;
use crate::{
    constants::*,
    error::ErrorCode,
    state::{Project, Promise, PromiseState},
};

#[derive(Accounts)]
pub struct Reclaim<'info> {
    #[account(address = promise.promiser @ ErrorCode::NotPromiser)]
    pub promiser: Signer<'info>,
    pub project: Account<'info, Project>,
    #[account(
        mut,
        has_one = project,
        has_one = promiser_token
    )]
    pub promise: Account<'info, Promise>,
    #[account(
        mut,
        seeds = [VAULT_SEED, project.key().as_ref()],
        bump = project.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub promiser_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_reclaim(ctx: Context<Reclaim>) -> Result<()> {
    let accounts = ctx.accounts;
    let age = Clock::get()?
        .unix_timestamp
        .saturating_sub(accounts.promise.created_at);
    require!(age > RECLAIM_AFTER_SECONDS, ErrorCode::TooEarlyToReclaim);

    settle(
        &accounts.project,
        &mut accounts.promise,
        &accounts.vault,
        &accounts.promiser_token,
        &accounts.token_program,
        PromiseState::Kept,
    )
}
