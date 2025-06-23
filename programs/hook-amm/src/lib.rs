use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("dfTYkrd8zYbX3znVnHbGRFGteDhy4AGeJtACeVXt3Rc");

#[program]
pub mod hook_amm {
    use super::*;

    pub fn initialize_global_config(ctx: Context<InitializeGlobalConfig>) -> Result<()> {
        initialize_global_config_handler(ctx)
    }

    pub fn create_bonding_curve<'info>(
        ctx: Context<'_, '_, '_, 'info, CreateBondingCurve<'info>>,
        params: CreateBondingCurveParams,
    ) -> Result<()> {
        create_bonding_curve_handler(ctx, params)
    }

    pub fn buy<'info>(
        ctx: Context<'_, '_, '_, 'info, Buy<'info>>, 
        sol_amount: u64, 
        min_token_amount: u64
    ) -> Result<()> {
        buy_handler(ctx, sol_amount, min_token_amount)
    }

    pub fn sell<'info>(
        ctx: Context<'_, '_, '_, 'info, Sell<'info>>, 
        token_amount: u64, 
        min_sol_amount: u64
    ) -> Result<()> {
        sell_handler(ctx, token_amount, min_sol_amount)
    }
}