import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { getGlobalConfigPDA } from '../utils/pda';

export async function createInitializeGlobalConfigInstruction(
  program: Program,
  authority: PublicKey,
  feeRecipient: PublicKey,
  payer: PublicKey
): Promise<TransactionInstruction> {
  const [globalConfig] = getGlobalConfigPDA();

  return await program.methods
    .initializeGlobalConfig(authority, feeRecipient)
    .accounts({
      globalConfig,
      authority: payer,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}