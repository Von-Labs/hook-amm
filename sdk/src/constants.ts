import { PublicKey } from '@solana/web3.js';

// Program ID - Update this with your deployed program ID
export const HOOK_AMM_PROGRAM_ID = new PublicKey('9rftcX9CMpRaZJUteZ5yyY5bxy2LKSGRfp3xq9uP1SaC');

// Seeds for PDAs
export const GLOBAL_CONFIG_SEED = Buffer.from('global_config');
export const BONDING_CURVE_SEED = Buffer.from('bonding_curve');
export const CURVE_TOKEN_ACCOUNT_SEED = Buffer.from('curve_token_account');

// Constants
export const FEE_BASIS_POINTS = 100; // 1% fee
export const LAMPORTS_PER_SOL = 1_000_000_000;