import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';

import { getGlobalConfigPDA, getBondingCurvePDA, getCurveTokenAccountPDA } from '../utils/pda';

export async function createBondingCurveInstruction(
  program: Program,
  tokenMint: PublicKey,
  creator: PublicKey,
  tokenProgramId: PublicKey,
  initialVirtualTokenReserves: BN,
  initialVirtualSolReserves: BN,
  initialRealTokenReserves: BN,
  tokenTotalSupply: BN
): Promise<TransactionInstruction> {
  const [globalConfig] = getGlobalConfigPDA();
  const [bondingCurve] = getBondingCurvePDA(tokenMint);
  const [curveTokenAccount] = getCurveTokenAccountPDA(bondingCurve, tokenMint);
  
  const creatorTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    creator,
    false,
    tokenProgramId
  );

  return await program.methods
    .createBondingCurve(
      initialVirtualTokenReserves,
      initialVirtualSolReserves,
      initialRealTokenReserves,
      tokenTotalSupply
    )
    .accounts({
      globalConfig,
      bondingCurve,
      mint: tokenMint,
      curveTokenAccount,
      creatorTokenAccount,
      creator,
      tokenProgram: tokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}