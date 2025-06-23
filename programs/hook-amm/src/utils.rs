use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use crate::errors::ErrorCode;

pub fn calculate_buy_amount(
    sol_amount: u64,
    sol_reserves: u64,
    token_reserves: u64,
) -> Result<u64> {
    // Use u128 for intermediate calculations to prevent overflow
    let sol_amount_u128 = sol_amount as u128;
    let sol_reserves_u128 = sol_reserves as u128;
    let token_reserves_u128 = token_reserves as u128;
    
    let new_sol_reserves_u128 = sol_reserves_u128.checked_add(sol_amount_u128).ok_or(ErrorCode::Overflow)?;
    
    // k = sol_reserves * token_reserves (using u128 to prevent overflow)
    let k = sol_reserves_u128.checked_mul(token_reserves_u128).ok_or(ErrorCode::Overflow)?;
    
    // new_token_reserves = k / new_sol_reserves
    let new_token_reserves_u128 = k.checked_div(new_sol_reserves_u128).ok_or(ErrorCode::Overflow)?;
    
    // tokens_out = token_reserves - new_token_reserves
    let tokens_out_u128 = token_reserves_u128.checked_sub(new_token_reserves_u128).ok_or(ErrorCode::InsufficientReserves)?;
    
    // Convert back to u64, checking for overflow
    let tokens_out = u64::try_from(tokens_out_u128).map_err(|_| ErrorCode::Overflow)?;
    
    Ok(tokens_out)
}

pub fn calculate_sell_amount(
    token_amount: u64,
    token_reserves: u64,
    sol_reserves: u64,
) -> Result<u64> {
    // Use u128 for intermediate calculations to prevent overflow
    let token_amount_u128 = token_amount as u128;
    let token_reserves_u128 = token_reserves as u128;
    let sol_reserves_u128 = sol_reserves as u128;
    
    let new_token_reserves_u128 = token_reserves_u128.checked_add(token_amount_u128).ok_or(ErrorCode::Overflow)?;
    
    // k = token_reserves * sol_reserves (using u128 to prevent overflow)
    let k = token_reserves_u128.checked_mul(sol_reserves_u128).ok_or(ErrorCode::Overflow)?;
    
    // new_sol_reserves = k / new_token_reserves
    let new_sol_reserves_u128 = k.checked_div(new_token_reserves_u128).ok_or(ErrorCode::Overflow)?;
    
    // sol_out = sol_reserves - new_sol_reserves
    let sol_out_u128 = sol_reserves_u128.checked_sub(new_sol_reserves_u128).ok_or(ErrorCode::InsufficientReserves)?;
    
    // Convert back to u64, checking for overflow
    let sol_out = u64::try_from(sol_out_u128).map_err(|_| ErrorCode::Overflow)?;
    
    Ok(sol_out)
}

pub fn perform_token_transfer<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    // Check if this is Token-2022 with transfer hooks
    let is_token_2022 = token_program.key() == token_2022::ID;
    
    if is_token_2022 && !remaining_accounts.is_empty() {
        // Token-2022 with potential transfer hooks
        let mut accounts = vec![
            from.clone(),
            mint.clone(),
            to.clone(),
            authority.clone(),
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
            decimals,
        )?;
        
        if signer_seeds.is_empty() {
            anchor_lang::solana_program::program::invoke(&transfer_ix, &accounts)?;
        } else {
            anchor_lang::solana_program::program::invoke_signed(&transfer_ix, &accounts, signer_seeds)?;
        }
    } else {
        // Regular transfer without hooks
        let cpi_accounts = anchor_spl::token_interface::TransferChecked {
            from: from.clone(),
            mint: mint.clone(),
            to: to.clone(),
            authority: authority.clone(),
        };
        
        let cpi_program = token_program.clone();
        let cpi_ctx = if signer_seeds.is_empty() {
            CpiContext::new(cpi_program, cpi_accounts)
        } else {
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds)
        };
        
        anchor_spl::token_interface::transfer_checked(cpi_ctx, amount, decimals)?;
    }
    
    Ok(())
}