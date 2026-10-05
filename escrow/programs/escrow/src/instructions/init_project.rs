use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{constants::*, error::ErrorCode, state::Project};

#[derive(Accounts)]
#[instruction(repo_id: u64)]
pub struct InitProject<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Project::INIT_SPACE,
        seeds = [PROJECT_SEED, &repo_id.to_le_bytes()],
        bump
    )]
    pub project: Account<'info, Project>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        seeds = [VAULT_SEED, project.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = project
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(token::mint = mint)]
    pub maintainer_wallet: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_project(
    ctx: Context<InitProject>,
    repo_id: u64,
    amount: u64,
    arbiter: Pubkey,
) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);

    let project = &mut ctx.accounts.project;
    project.repo_id = repo_id;
    project.arbiter = arbiter;
    project.mint = ctx.accounts.mint.key();
    project.maintainer_wallet = ctx.accounts.maintainer_wallet.key();
    project.amount = amount;
    project.bump = ctx.bumps.project;
    project.vault_bump = ctx.bumps.vault;
    Ok(())
}
