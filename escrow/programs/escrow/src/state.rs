use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Project {
    pub repo_id: u64,
    pub arbiter: Pubkey,
    pub mint: Pubkey,
    pub maintainer_wallet: Pubkey,
    pub amount: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PromiseState {
    Open,
    Kept,
    Broken,
}

#[account]
#[derive(InitSpace)]
pub struct Promise {
    pub project: Pubkey,
    pub issue_number: u64,
    pub promiser: Pubkey,
    pub promiser_token: Pubkey,
    pub amount: u64,
    pub state: PromiseState,
    pub created_at: i64,
    pub bump: u8,
}
