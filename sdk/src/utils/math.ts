import BN from 'bn.js';
import { FEE_BASIS_POINTS, FEE_DENOMINATOR } from '../core/constants';

export function calculateBuyAmount(
  solAmountIn: BN,
  virtualSolReserves: BN,
  virtualTokenReserves: BN,
  realSolReserves: BN,
  realTokenReserves: BN
): { tokenAmount: BN; fee: BN } {
  // Calculate fee (1%)
  const fee = solAmountIn.mul(new BN(FEE_BASIS_POINTS)).div(new BN(FEE_DENOMINATOR));
  const solAmountAfterFee = solAmountIn.sub(fee);

  // Calculate current reserves
  const currentSolReserves = virtualSolReserves.add(realSolReserves);
  const currentTokenReserves = virtualTokenReserves.sub(realTokenReserves);

  // Calculate invariant k = x * y
  const k = currentSolReserves.mul(currentTokenReserves);

  // Calculate new SOL reserves after trade
  const newSolReserves = currentSolReserves.add(solAmountAfterFee);

  // Calculate new token reserves to maintain k
  const newTokenReserves = k.div(newSolReserves);

  // Calculate tokens out
  const tokenAmount = currentTokenReserves.sub(newTokenReserves);

  return { tokenAmount, fee };
}

export function calculateSellAmount(
  tokenAmountIn: BN,
  virtualSolReserves: BN,
  virtualTokenReserves: BN,
  realSolReserves: BN,
  realTokenReserves: BN
): { solAmount: BN; fee: BN } {
  // Calculate current reserves
  const currentSolReserves = virtualSolReserves.add(realSolReserves);
  const currentTokenReserves = virtualTokenReserves.sub(realTokenReserves);

  // Calculate invariant k = x * y
  const k = currentSolReserves.mul(currentTokenReserves);

  // Calculate new token reserves after trade
  const newTokenReserves = currentTokenReserves.add(tokenAmountIn);

  // Calculate new SOL reserves to maintain k
  const newSolReserves = k.div(newTokenReserves);

  // Calculate SOL out before fee
  const solAmountBeforeFee = currentSolReserves.sub(newSolReserves);

  // Calculate fee (1%)
  const fee = solAmountBeforeFee.mul(new BN(FEE_BASIS_POINTS)).div(new BN(FEE_DENOMINATOR));
  const solAmount = solAmountBeforeFee.sub(fee);

  return { solAmount, fee };
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