import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, SEEDS } from '../core/constants';

export function getGlobalConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.GLOBAL_CONFIG)],
    PROGRAM_ID
  );
}

export function getBondingCurvePDA(tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.BONDING_CURVE), tokenMint.toBuffer()],
    PROGRAM_ID
  );
}

export function getCurveTokenAccountPDA(bondingCurve: PublicKey, tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.CURVE_TOKEN_ACCOUNT), bondingCurve.toBuffer(), tokenMint.toBuffer()],
    PROGRAM_ID
  );
}