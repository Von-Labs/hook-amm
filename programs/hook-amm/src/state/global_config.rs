use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub total_curves: u64,
}