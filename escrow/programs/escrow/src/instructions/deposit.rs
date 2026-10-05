use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    state::{Project, Promise, PromiseState},
};

#[derive(Accounts)]
#[instruction(issue_number: u64)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub promiser: Signer<'info>,
    pub project: Account<'info, Project>,
    #[account(
        init,
        payer = promiser,
        space = 8 + Promise::INIT_SPACE,
        seeds = [PROMISE_SEED, project.key().as_ref(), &issue_number.to_le_bytes()],
        bump
    )]
    pub promise: Account<'info, Promise>,
    #[account(
        mut,
        token::mint = project.mint,
        token::authority = promiser
    )]
    pub promiser_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [VAULT_SEED, project.key().as_ref()],
        bump = project.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_deposit(ctx: Context<Deposit>, issue_number: u64) -> Result<()> {
    let amount = ctx.accounts.project.amount;

    let promise = &mut ctx.accounts.promise;
    promise.project = ctx.accounts.project.key();
    promise.issue_number = issue_number;
    promise.promiser = ctx.accounts.promiser.key();
    promise.promiser_token = ctx.accounts.promiser_token.key();
    promise.amount = amount;
    promise.state = PromiseState::Open;
    promise.created_at = Clock::get()?.unix_timestamp;
    promise.bump = ctx.bumps.promise;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.promiser_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.promiser.to_account_info(),
            },
        ),
        amount,
    )
}
