use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{GlobalConfig, BondingCurve};
use crate::constants::*;
use crate::errors::ErrorCode;

#[derive(Accounts)]
pub struct CreateBondingCurve<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + BondingCurve::INIT_SPACE,
        seeds = [BONDING_CURVE_SEED, mint.key().as_ref()],
        bump
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    
    #[account(
        init,
        payer = creator,
        seeds = [CURVE_TOKEN_ACCOUNT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = bonding_curve,
        token::token_program = token_program,
    )]
    pub curve_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub creator: Signer<'info>,
    
    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateBondingCurveParams {
    pub initial_supply: u64,
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
}

pub fn create_bonding_curve_handler(ctx: Context<CreateBondingCurve>, params: CreateBondingCurveParams) -> Result<()> {
    // Validate parameters
    require!(params.initial_supply > 0, ErrorCode::InvalidAmount);
    require!(params.virtual_token_reserves > 0, ErrorCode::InvalidAmount);
    require!(params.virtual_sol_reserves > 0, ErrorCode::InvalidAmount);
    
    let bonding_curve = &mut ctx.accounts.bonding_curve;
    let global_config = &mut ctx.accounts.global_config;
    
    bonding_curve.mint = ctx.accounts.mint.key();
    bonding_curve.creator = ctx.accounts.creator.key();
    bonding_curve.virtual_token_reserves = params.virtual_token_reserves;
    bonding_curve.virtual_sol_reserves = params.virtual_sol_reserves;
    bonding_curve.real_token_reserves = 0;
    bonding_curve.real_sol_reserves = 0;
    bonding_curve.token_total_supply = params.initial_supply;
    bonding_curve.complete = false;
    bonding_curve.index = global_config.total_curves;
    
    global_config.total_curves += 1;
    
    Ok(())
}