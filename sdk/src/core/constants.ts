import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('gQJapJpSreNmTsTNT51qHC7oTJTA6JE5hJqYNiR214F');

export const SEEDS = {
  GLOBAL_CONFIG: 'global_config',
  BONDING_CURVE: 'bonding_curve',
  CURVE_TOKEN_ACCOUNT: 'curve_token_account',
} as const;

export const FEE_BASIS_POINTS = 100; // 1%
export const FEE_DENOMINATOR = 10000;