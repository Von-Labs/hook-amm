use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Curve is complete")]
    CurveComplete,
    #[msg("Insufficient reserves")]
    InsufficientReserves,
    #[msg("Overflow")]
    Overflow,
    #[msg("Unauthorized mint authority")]
    UnauthorizedMintAuthority,
    #[msg("Invalid supply")]
    InvalidSupply,
    #[msg("Creator must have all tokens")]
    CreatorMustHaveAllTokens,
    #[msg("Curve account not empty")]
    CurveAccountNotEmpty,
    #[msg("Virtual reserves too small")]
    VirtualReservesTooSmall,
    #[msg("Insufficient balance")]
    InsufficientBalance,
}