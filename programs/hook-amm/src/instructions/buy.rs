use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{GlobalConfig, BondingCurve};
use crate::constants::*;
use crate::errors::ErrorCode;
use crate::events::TradeEvent;
use crate::utils::calculate_buy_amount;

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(
        mut,
        seeds = [BONDING_CURVE_SEED, mint.key().as_ref()],
        bump
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    
    #[account(
        mut,
        seeds = [CURVE_TOKEN_ACCOUNT_SEED, mint.key().as_ref()],
        bump,
    )]
    pub curve_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub mint: InterfaceAccount<'info, Mint>,
    
    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    
    /// CHECK: Fee recipient from global config
    #[account(
        mut,
        constraint = fee_recipient.key() == global_config.fee_recipient
    )]
    pub fee_recipient: AccountInfo<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn buy_handler(ctx: Context<Buy>, sol_amount: u64, min_token_amount: u64) -> Result<()> {
    require!(sol_amount > 0, ErrorCode::InvalidAmount);
    require!(!ctx.accounts.bonding_curve.complete, ErrorCode::CurveComplete);
    
    // Calculate output amount using constant product formula
    let fee_amount = sol_amount
        .checked_mul(FEE_BASIS_POINTS as u64)
        .unwrap()
        .checked_div(10000)
        .unwrap();
    let sol_amount_after_fee = sol_amount.checked_sub(fee_amount).unwrap();
    
    let token_amount = calculate_buy_amount(
        sol_amount_after_fee,
        ctx.accounts.bonding_curve.virtual_sol_reserves + ctx.accounts.bonding_curve.real_sol_reserves,
        ctx.accounts.bonding_curve.virtual_token_reserves - ctx.accounts.bonding_curve.real_token_reserves,
    )?;
    
    require!(token_amount >= min_token_amount, ErrorCode::SlippageExceeded);
    
    // Update reserves
    ctx.accounts.bonding_curve.real_sol_reserves = ctx.accounts.bonding_curve.real_sol_reserves
        .checked_add(sol_amount_after_fee)
        .unwrap();
    ctx.accounts.bonding_curve.real_token_reserves = ctx.accounts.bonding_curve.real_token_reserves
        .checked_sub(token_amount)
        .unwrap();
    
    // Transfer SOL from buyer to curve (only the amount after fee)
    let sol_transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.user.key(),
        &ctx.accounts.bonding_curve.key(),
        sol_amount_after_fee,
    );
    anchor_lang::solana_program::program::invoke(
        &sol_transfer_ix,
        &[
            ctx.accounts.user.to_account_info(),
            ctx.accounts.bonding_curve.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;
    
    // Transfer fee directly from user to fee recipient
    if fee_amount > 0 {
        let fee_transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.global_config.fee_recipient,
            fee_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &fee_transfer_ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.fee_recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
    }
    
    // Transfer tokens from curve to buyer
    let cpi_accounts = anchor_spl::token_interface::TransferChecked {
        from: ctx.accounts.curve_token_account.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.bonding_curve.to_account_info(),
    };
    
    // Set up seeds with proper lifetimes
    let bonding_curve_seed = BONDING_CURVE_SEED;
    let mint_key = ctx.accounts.mint.key();
    let bump = ctx.bumps.bonding_curve;

    // Create the seeds array with the correct lifetime
    let signer_seeds = &[
        bonding_curve_seed,
        mint_key.as_ref(),
        &[bump],
    ];

    // Create a reference to the seeds array with the right structure for CPI
    let signers = &[&signer_seeds[..]];
    
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signers
    );
    
    anchor_spl::token_interface::transfer_checked(cpi_ctx, token_amount, ctx.accounts.mint.decimals)?;
    
    emit!(TradeEvent {
        mint: ctx.accounts.mint.key(),
        user: ctx.accounts.user.key(),
        sol_amount,
        token_amount,
        is_buy: true,
        virtual_sol_reserves: ctx.accounts.bonding_curve.virtual_sol_reserves + ctx.accounts.bonding_curve.real_sol_reserves,
        virtual_token_reserves: ctx.accounts.bonding_curve.virtual_token_reserves - ctx.accounts.bonding_curve.real_token_reserves,
    });
    
    Ok(())
}