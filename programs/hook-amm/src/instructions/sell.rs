use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{GlobalConfig, BondingCurve};
use crate::constants::*;
use crate::errors::ErrorCode;
use crate::events::TradeEvent;
use crate::utils::calculate_sell_amount;

#[derive(Accounts)]
pub struct Sell<'info> {
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

pub fn sell_handler<'info>(ctx: Context<'_, '_, '_, 'info, Sell<'info>>, token_amount: u64, min_sol_amount: u64) -> Result<()> {
    require!(token_amount > 0, ErrorCode::InvalidAmount);
    require!(!ctx.accounts.bonding_curve.complete, ErrorCode::CurveComplete);
    
    // Calculate output amount using constant product formula
    let sol_amount = calculate_sell_amount(
        token_amount,
        ctx.accounts.bonding_curve.virtual_token_reserves
            .checked_sub(ctx.accounts.bonding_curve.real_token_reserves)
            .ok_or(ErrorCode::InsufficientReserves)?,
        ctx.accounts.bonding_curve.virtual_sol_reserves
            .checked_add(ctx.accounts.bonding_curve.real_sol_reserves)
            .ok_or(ErrorCode::Overflow)?,
    )?;
    
    let fee_amount = sol_amount
        .checked_mul(FEE_BASIS_POINTS as u64)
        .ok_or(ErrorCode::Overflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::Overflow)?;
    let sol_amount_after_fee = sol_amount.checked_sub(fee_amount).ok_or(ErrorCode::Overflow)?;
    
    require!(sol_amount_after_fee >= min_sol_amount, ErrorCode::SlippageExceeded);
    
    // Transfer tokens from seller to curve
    let is_token_2022 = ctx.accounts.token_program.key() == anchor_spl::token_2022::ID;
    
    if is_token_2022 && !ctx.remaining_accounts.is_empty() {
        // Handle Token-2022 with transfer hooks
        let transfer_ix = anchor_spl::token_2022::spl_token_2022::instruction::transfer_checked(
            &ctx.accounts.token_program.key(),
            &ctx.accounts.user_token_account.key(),
            &ctx.accounts.mint.key(),
            &ctx.accounts.curve_token_account.key(),
            &ctx.accounts.user.key(),
            &[],
            token_amount,
            ctx.accounts.mint.decimals,
        )?;
        
        let mut account_infos = vec![
            ctx.accounts.user_token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.curve_token_account.to_account_info(),
            ctx.accounts.user.to_account_info(),
        ];
        
        // Add remaining accounts for transfer hooks
        for account in ctx.remaining_accounts {
            account_infos.push(account.clone());
        }
        
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &account_infos,
        )?;
    } else {
        // Regular token transfer
        let cpi_accounts = anchor_spl::token_interface::TransferChecked {
            from: ctx.accounts.user_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.curve_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
        );
        
        anchor_spl::token_interface::transfer_checked(cpi_ctx, token_amount, ctx.accounts.mint.decimals)?;
    }
    
    // Update reserves
    ctx.accounts.bonding_curve.real_sol_reserves = ctx.accounts.bonding_curve.real_sol_reserves
        .checked_sub(sol_amount)
        .ok_or(ErrorCode::InsufficientReserves)?;
    ctx.accounts.bonding_curve.real_token_reserves = ctx.accounts.bonding_curve.real_token_reserves
        .checked_add(token_amount)
        .ok_or(ErrorCode::Overflow)?;
    
    // Transfer SOL from curve to seller
    **ctx.accounts.bonding_curve.to_account_info().try_borrow_mut_lamports()? -= sol_amount_after_fee;
    **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += sol_amount_after_fee;
    
    // Transfer fee to fee recipient
    if fee_amount > 0 {
        **ctx.accounts.bonding_curve.to_account_info().try_borrow_mut_lamports()? -= fee_amount;
        **ctx.accounts.fee_recipient.to_account_info().try_borrow_mut_lamports()? += fee_amount;
    }
    
    emit!(TradeEvent {
        mint: ctx.accounts.mint.key(),
        user: ctx.accounts.user.key(),
        sol_amount: sol_amount_after_fee,
        token_amount,
        is_buy: false,
        virtual_sol_reserves: ctx.accounts.bonding_curve.virtual_sol_reserves
            .checked_add(ctx.accounts.bonding_curve.real_sol_reserves)
            .ok_or(ErrorCode::Overflow)?,
        virtual_token_reserves: ctx.accounts.bonding_curve.virtual_token_reserves
            .checked_sub(ctx.accounts.bonding_curve.real_token_reserves)
            .ok_or(ErrorCode::InsufficientReserves)?,
    });
    
    Ok(())
}