use anchor_lang::prelude::*;

#[event]
pub struct TradeEvent {
    pub mint: Pubkey,
    pub user: Pubkey,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub is_buy: bool,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
}