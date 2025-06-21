use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use anchor_spl::token_2022;
use crate::errors::ErrorCode;

pub fn calculate_buy_amount(
    sol_amount: u64,
    sol_reserves: u64,
    token_reserves: u64,
) -> Result<u64> {
    let new_sol_reserves = sol_reserves.checked_add(sol_amount).ok_or(ErrorCode::Overflow)?;
    let new_token_reserves = sol_reserves
        .checked_mul(token_reserves).ok_or(ErrorCode::Overflow)?
        .checked_div(new_sol_reserves).ok_or(ErrorCode::Overflow)?;
    
    token_reserves.checked_sub(new_token_reserves).ok_or(ErrorCode::InsufficientReserves.into())
}

pub fn calculate_sell_amount(
    token_amount: u64,
    token_reserves: u64,
    sol_reserves: u64,
) -> Result<u64> {
    let new_token_reserves = token_reserves.checked_add(token_amount).ok_or(ErrorCode::Overflow)?;
    let new_sol_reserves = token_reserves
        .checked_mul(sol_reserves).ok_or(ErrorCode::Overflow)?
        .checked_div(new_token_reserves).ok_or(ErrorCode::Overflow)?;
    
    sol_reserves.checked_sub(new_sol_reserves).ok_or(ErrorCode::InsufficientReserves.into())
}

pub fn perform_token_transfer<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    // Check if this is Token-2022 with transfer hooks
    let is_token_2022 = token_program.key() == token_2022::ID;
    
    if is_token_2022 && !remaining_accounts.is_empty() {
        // Token-2022 with potential transfer hooks
        let mut accounts = vec![
            from.to_account_info(),
            mint.to_account_info(),
            to.to_account_info(),
            authority.to_account_info(),
        ];
        
        // Add hook accounts from remaining_accounts
        for account in remaining_accounts {
            accounts.push(account.clone());
        }
        
        // Build transfer instruction with hook support
        let transfer_ix = anchor_spl::token_2022::spl_token_2022::instruction::transfer_checked(
            &token_program.key(),
            &from.key(),
            &mint.key(),
            &to.key(),
            &authority.key(),
            &[],
            amount,
            mint.decimals,
        )?;
        
        if signer_seeds.is_empty() {
            anchor_lang::solana_program::program::invoke(&transfer_ix, &accounts)?;
        } else {
            anchor_lang::solana_program::program::invoke_signed(&transfer_ix, &accounts, signer_seeds)?;
        }
    } else {
        // Regular transfer without hooks
        let cpi_accounts = anchor_spl::token_interface::TransferChecked {
            from: from.to_account_info(),
            mint: mint.to_account_info(),
            to: to.to_account_info(),
            authority: authority.to_account_info(),
        };
        
        let cpi_program = token_program.to_account_info();
        let cpi_ctx = if signer_seeds.is_empty() {
            CpiContext::new(cpi_program, cpi_accounts)
        } else {
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds)
        };
        
        anchor_spl::token_interface::transfer_checked(cpi_ctx, amount, mint.decimals)?;
    }
    
    Ok(())
}