use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Project, Promise, PromiseState},
};

/// Moves an open promise's tokens from the vault to `destination` and records the outcome.
pub(crate) fn settle<'info>(
    project: &Account<'info, Project>,
    promise: &mut Account<'info, Promise>,
    vault: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    outcome: PromiseState,
) -> Result<()> {
    require!(promise.state == PromiseState::Open, ErrorCode::PromiseSettled);
    promise.state = outcome;

    let repo_id = project.repo_id.to_le_bytes();
    let signer_seeds: &[&[&[u8]]] = &[&[PROJECT_SEED, &repo_id, &[project.bump]]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.key(),
            Transfer {
                from: vault.to_account_info(),
                to: destination.to_account_info(),
                authority: project.to_account_info(),
            },
            signer_seeds,
        ),
        promise.amount,
    )
}
