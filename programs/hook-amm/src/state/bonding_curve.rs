use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct BondingCurve {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub token_total_supply: u64,
    pub complete: bool,
    pub index: u64,
}