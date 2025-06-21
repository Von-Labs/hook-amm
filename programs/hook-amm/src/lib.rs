use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("9rftcX9CMpRaZJUteZ5yyY5bxy2LKSGRfp3xq9uP1SaC");

#[program]
pub mod hook_amm {
    use super::*;

    pub fn initialize_global_config(ctx: Context<InitializeGlobalConfig>) -> Result<()> {
        initialize_global_config_handler(ctx)
    }

    pub fn create_bonding_curve(
        ctx: Context<CreateBondingCurve>,
        params: CreateBondingCurveParams,
    ) -> Result<()> {
        create_bonding_curve_handler(ctx, params)
    }

    pub fn buy(ctx: Context<Buy>, sol_amount: u64, min_token_amount: u64) -> Result<()> {
        buy_handler(ctx, sol_amount, min_token_amount)
    }

    pub fn sell(ctx: Context<Sell>, token_amount: u64, min_sol_amount: u64) -> Result<()> {
        sell_handler(ctx, token_amount, min_sol_amount)
    }
}
