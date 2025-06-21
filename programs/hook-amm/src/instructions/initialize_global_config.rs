use anchor_lang::prelude::*;
use crate::state::GlobalConfig;
use crate::constants::GLOBAL_CONFIG_SEED;

#[derive(Accounts)]
pub struct InitializeGlobalConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Fee recipient can be any account
    pub fee_recipient: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_global_config_handler(ctx: Context<InitializeGlobalConfig>) -> Result<()> {
    let global_config = &mut ctx.accounts.global_config;
    global_config.authority = ctx.accounts.authority.key();
    global_config.fee_recipient = ctx.accounts.fee_recipient.key();
    global_config.total_curves = 0;
    Ok(())
}