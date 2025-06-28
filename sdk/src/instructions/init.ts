import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { getGlobalConfigPDA } from '../utils/pda';

export async function createInitializeGlobalConfigInstruction(
  program: Program,
  authority: PublicKey,
  feeRecipient: PublicKey
): Promise<TransactionInstruction> {
  const [globalConfig] = getGlobalConfigPDA();

  return await program.methods
    .initializeGlobalConfig()
    .accounts({
      globalConfig,
      authority,
      feeRecipient,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}