import BN from 'bn.js';
import { FEE_BASIS_POINTS, FEE_DENOMINATOR } from '../core/constants';

export function calculateBuyAmount(
  solAmountAfterFee: BN,
  currentSolReserves: BN,
  currentTokenReserves: BN,
  realSolReserves: BN,
  realTokenReserves: BN
): { tokenAmount: BN; fee: BN } {
  // Using the exact program formula from utils.rs:
  // k = sol_reserves * token_reserves
  // new_sol_reserves = sol_reserves + sol_amount
  // new_token_reserves = k / new_sol_reserves
  // tokens_out = token_reserves - new_token_reserves

  const k = currentSolReserves.mul(currentTokenReserves);
  const newSolReserves = currentSolReserves.add(solAmountAfterFee);
  const newTokenReserves = k.div(newSolReserves);
  const tokenAmount = currentTokenReserves.sub(newTokenReserves);

  // Fee is calculated separately by the caller
  return { tokenAmount, fee: new BN(0) };
}

export function calculateSellAmount(
  tokenAmountIn: BN,
  currentTokenReserves: BN,
  currentSolReserves: BN,
  realTokenReserves: BN,
  realSolReserves: BN
): { solAmount: BN; fee: BN } {
  // Using the exact program formula from utils.rs:
  // k = token_reserves * sol_reserves
  // new_token_reserves = token_reserves + token_amount
  // new_sol_reserves = k / new_token_reserves
  // sol_out = sol_reserves - new_sol_reserves

  const k = currentTokenReserves.mul(currentSolReserves);
  const newTokenReserves = currentTokenReserves.add(tokenAmountIn);
  const newSolReserves = k.div(newTokenReserves);
  const solAmount = currentSolReserves.sub(newSolReserves);

  // Fee is calculated separately by the caller
  return { solAmount, fee: new BN(0) };
}

export function calculatePriceImpact(
  inputAmount: BN,
  outputAmount: BN,
  inputReserves: BN,
  outputReserves: BN
): number {
  // Calculate spot price before trade
  const spotPrice = outputReserves.mul(new BN(10000)).div(inputReserves);
  
  // Calculate effective price after trade
  const effectivePrice = outputAmount.mul(new BN(10000)).div(inputAmount);
  
  // Calculate price impact as percentage
  const priceImpact = spotPrice.sub(effectivePrice).mul(new BN(10000)).div(spotPrice);
  
  return priceImpact.toNumber() / 100; // Return as percentage
}

export function calculateTokenPrice(
  virtualSolReserves: BN,
  virtualTokenReserves: BN,
  realSolReserves: BN,
  realTokenReserves: BN
): number {
  const currentSolReserves = virtualSolReserves.add(realSolReserves);
  const currentTokenReserves = virtualTokenReserves.sub(realTokenReserves);
  
  // Price = SOL reserves / Token reserves
  // Return price in SOL per token with 9 decimal precision
  return currentSolReserves.mul(new BN(10).pow(new BN(9))).div(currentTokenReserves).toNumber() / 1e9;
}