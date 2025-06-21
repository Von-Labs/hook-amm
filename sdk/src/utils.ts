import { PublicKey, Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';
import { 
  GLOBAL_CONFIG_SEED, 
  BONDING_CURVE_SEED, 
  CURVE_TOKEN_ACCOUNT_SEED,
  FEE_BASIS_POINTS,
  LAMPORTS_PER_SOL
} from './constants';
import { PriceCalculation, BondingCurve } from './types';

/**
 * Calculate the output amount for a buy transaction
 */
export function calculateBuyAmount(
  solAmount: BN,
  solReserves: BN,
  tokenReserves: BN
): BN {
  const newSolReserves = solReserves.add(solAmount);
  const newTokenReserves = solReserves.mul(tokenReserves).div(newSolReserves);
  return tokenReserves.sub(newTokenReserves);
}

/**
 * Calculate the output amount for a sell transaction
 */
export function calculateSellAmount(
  tokenAmount: BN,
  tokenReserves: BN,
  solReserves: BN
): BN {
  const newTokenReserves = tokenReserves.add(tokenAmount);
  const newSolReserves = tokenReserves.mul(solReserves).div(newTokenReserves);
  return solReserves.sub(newSolReserves);
}

/**
 * Calculate fee amount
 */
export function calculateFee(amount: BN): BN {
  return amount.muln(FEE_BASIS_POINTS).divn(10000);
}

/**
 * Get PDA addresses
 */
export function getPDAs(programId: PublicKey, mint?: PublicKey) {
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [GLOBAL_CONFIG_SEED],
    programId
  );

  if (!mint) {
    return { globalConfig };
  }

  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [BONDING_CURVE_SEED, mint.toBuffer()],
    programId
  );

  const [curveTokenAccount] = PublicKey.findProgramAddressSync(
    [CURVE_TOKEN_ACCOUNT_SEED, mint.toBuffer()],
    programId
  );

  return {
    globalConfig,
    bondingCurve,
    curveTokenAccount
  };
}

/**
 * Get user token account address
 */
export async function getUserTokenAccount(
  mint: PublicKey,
  owner: PublicKey,
  allowOwnerOffCurve = false,
  programId = TOKEN_PROGRAM_ID
): Promise<PublicKey> {
  return getAssociatedTokenAddress(
    mint,
    owner,
    allowOwnerOffCurve,
    programId
  );
}

/**
 * Calculate current price and market metrics
 */
export function calculatePrice(bondingCurve: BondingCurve): PriceCalculation {
  const totalSolReserves = bondingCurve.virtualSolReserves.add(bondingCurve.realSolReserves);
  const totalTokenReserves = bondingCurve.virtualTokenReserves.sub(bondingCurve.realTokenReserves);
  
  // Price = SOL reserves / Token reserves
  const price = totalSolReserves.toNumber() / totalTokenReserves.toNumber();
  
  // Price per token in SOL
  const pricePerToken = price;
  
  // Market cap in lamports
  const marketCap = bondingCurve.tokenTotalSupply.toNumber() * price;
  
  return {
    price,
    pricePerToken,
    marketCap,
    availableTokens: totalTokenReserves,
    availableSol: totalSolReserves
  };
}

/**
 * Format token amount considering decimals
 */
export function formatTokenAmount(amount: BN, decimals: number): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const quotient = amount.div(divisor);
  const remainder = amount.mod(divisor);
  
  if (remainder.isZero()) {
    return quotient.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmed = remainderStr.replace(/0+$/, '');
  
  return `${quotient}.${trimmed}`;
}

/**
 * Parse token amount string to BN considering decimals
 */
export function parseTokenAmount(amount: string, decimals: number): BN {
  const parts = amount.split('.');
  const wholePart = parts[0] || '0';
  const fractionalPart = parts[1] || '';
  
  const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  const combined = wholePart + paddedFractional;
  
  return new BN(combined);
}

/**
 * Format SOL amount from lamports
 */
export function formatSolAmount(lamports: BN): string {
  return formatTokenAmount(lamports, 9);
}

/**
 * Parse SOL amount to lamports
 */
export function parseSolAmount(sol: string): BN {
  return parseTokenAmount(sol, 9);
}

/**
 * Calculate minimum received amount with slippage
 */
export function calculateMinimumReceived(amount: BN, slippageBps: number): BN {
  const slippageMultiplier = 10000 - slippageBps;
  return amount.muln(slippageMultiplier).divn(10000);
}

/**
 * Check if a bonding curve can still accept trades
 */
export function isCurveActive(bondingCurve: BondingCurve): boolean {
  return !bondingCurve.complete;
}

/**
 * Estimate the impact of a trade on price
 */
export function estimatePriceImpact(
  bondingCurve: BondingCurve,
  isBuy: boolean,
  amount: BN
): number {
  const currentPrice = calculatePrice(bondingCurve);
  
  // Create a copy of bonding curve with simulated trade
  const simulatedCurve = { ...bondingCurve };
  
  if (isBuy) {
    const fee = calculateFee(amount);
    const amountAfterFee = amount.sub(fee);
    const tokenAmount = calculateBuyAmount(
      amountAfterFee,
      bondingCurve.virtualSolReserves.add(bondingCurve.realSolReserves),
      bondingCurve.virtualTokenReserves.sub(bondingCurve.realTokenReserves)
    );
    
    simulatedCurve.realSolReserves = bondingCurve.realSolReserves.add(amountAfterFee);
    simulatedCurve.realTokenReserves = bondingCurve.realTokenReserves.add(tokenAmount);
  } else {
    const solAmount = calculateSellAmount(
      amount,
      bondingCurve.virtualTokenReserves.sub(bondingCurve.realTokenReserves),
      bondingCurve.virtualSolReserves.add(bondingCurve.realSolReserves)
    );
    
    simulatedCurve.realSolReserves = bondingCurve.realSolReserves.sub(solAmount);
    simulatedCurve.realTokenReserves = bondingCurve.realTokenReserves.sub(amount);
  }
  
  const newPrice = calculatePrice(simulatedCurve);
  const priceImpact = ((newPrice.price - currentPrice.price) / currentPrice.price) * 100;
  
  return Math.abs(priceImpact);
}