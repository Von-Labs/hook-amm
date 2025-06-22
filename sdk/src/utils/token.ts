import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint, Mint } from '@solana/spl-token';

export async function getTokenProgramId(
  connection: Connection,
  mintAddress: PublicKey
): Promise<PublicKey> {
  const mintInfo = await connection.getAccountInfo(mintAddress);
  if (!mintInfo) {
    throw new Error('Mint account not found');
  }

  // Check if the mint is owned by Token-2022 program
  if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  
  return TOKEN_PROGRAM_ID;
}

export async function getMintInfo(
  connection: Connection,
  mintAddress: PublicKey
): Promise<Mint> {
  const tokenProgramId = await getTokenProgramId(connection, mintAddress);
  return getMint(connection, mintAddress, undefined, tokenProgramId);
}

export function isToken2022(mintInfo: AccountInfo<Buffer>): boolean {
  return mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
}

export async function getTransferHookAccounts(
  connection: Connection,
  mintAddress: PublicKey,
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint
): Promise<PublicKey[]> {
  // This is a placeholder for transfer hook account resolution
  // In a real implementation, you would:
  // 1. Check if the mint has transfer hooks enabled
  // 2. Get the transfer hook program ID from the mint
  // 3. Call the hook program to get required accounts
  
  // For now, return empty array (no additional accounts needed)
  return [];
}