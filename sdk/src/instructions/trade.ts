import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';

import { getGlobalConfigPDA, getCurveTokenAccountPDA } from '../utils/pda';

export async function createBuyInstruction(
  program: Program,
  bondingCurve: PublicKey,
  tokenMint: PublicKey,
  user: PublicKey,
  feeRecipient: PublicKey,
  tokenProgramId: PublicKey,
  solAmount: BN,
  minTokenAmount: BN,
  hookAccounts: PublicKey[] = []
): Promise<TransactionInstruction> {
  const [globalConfig] = getGlobalConfigPDA();
  const [curveTokenAccount] = getCurveTokenAccountPDA(bondingCurve, tokenMint);
  
  const userTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    user,
    false,
    tokenProgramId
  );

  return await program.methods
    .buy(solAmount, minTokenAmount)
    .accounts({
      globalConfig,
      bondingCurve,
      mint: tokenMint,
      curveTokenAccount,
      userTokenAccount,
      user,
      feeRecipient,
      tokenProgram: tokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(hookAccounts.map(account => ({ 
      pubkey: account, 
      isSigner: false, 
      isWritable: false 
    })))
    .instruction();
}

export async function createSellInstruction(
  program: Program,
  bondingCurve: PublicKey,
  tokenMint: PublicKey,
  user: PublicKey,
  feeRecipient: PublicKey,
  tokenProgramId: PublicKey,
  tokenAmount: BN,
  minSolAmount: BN,
  hookAccounts: PublicKey[] = []
): Promise<TransactionInstruction> {
  const [globalConfig] = getGlobalConfigPDA();
  const [curveTokenAccount] = getCurveTokenAccountPDA(bondingCurve, tokenMint);
  
  const userTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    user,
    false,
    tokenProgramId
  );

  return await program.methods
    .sell(tokenAmount, minSolAmount)
    .accounts({
      globalConfig,
      bondingCurve,
      mint: tokenMint,
      curveTokenAccount,
      userTokenAccount,
      user,
      feeRecipient,
      tokenProgram: tokenProgramId,
      systemProgram: SystemProgram.programId,
    })
    .remainingAccounts(hookAccounts.map(account => ({ 
      pubkey: account, 
      isSigner: false, 
      isWritable: false 
    })))
    .instruction();
}