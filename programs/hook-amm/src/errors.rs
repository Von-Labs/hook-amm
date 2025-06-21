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
}