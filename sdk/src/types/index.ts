import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

// Export wallet types
export * from './wallet';

export interface GlobalConfig {
  authority: PublicKey;
  feeRecipient: PublicKey;
  totalCurves: BN;
}

export interface BondingCurve {
  mint: PublicKey;
  creator: PublicKey;
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
  realTokenReserves: BN;
  realSolReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
  index: BN;
}

export interface TradeEvent {
  mint: PublicKey;
  solAmount: BN;
  tokenAmount: BN;
  isBuy: boolean;
  user: PublicKey;
  timestamp: BN;
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
  realSolReserves: BN;
  realTokenReserves: BN;
}

export interface CreateBondingCurveParams {
  tokenMint: PublicKey;
  initialSupply: BN;
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
}

export interface BuyParams {
  bondingCurve: PublicKey;
  solAmount: BN;
  minTokenAmount: BN;
}

export interface SellParams {
  bondingCurve: PublicKey;
  tokenAmount: BN;
  minSolAmount: BN;
}

export interface SwapResult {
  inputAmount: BN;
  outputAmount: BN;
  fee: BN;
  priceImpact: number;
}

export interface PriceQuote {
  tokenAmount: BN;
  solAmount: BN;
  fee: BN;
  pricePerToken: number;
  priceImpact: number;
}