import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

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

export interface CreateBondingCurveParams {
  initialSupply: BN;
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
}

export interface TradeEvent {
  mint: PublicKey;
  user: PublicKey;
  solAmount: BN;
  tokenAmount: BN;
  isBuy: boolean;
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
}

export interface BuyParams {
  solAmount: BN;
  minTokenAmount: BN;
}

export interface SellParams {
  tokenAmount: BN;
  minSolAmount: BN;
}

export interface PriceCalculation {
  price: number;
  pricePerToken: number;
  marketCap: number;
  availableTokens: BN;
  availableSol: BN;
}