import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID, 
  TOKEN_PROGRAM_ID, 
  getMint, 
  Mint,
  getTransferHook
} from '@solana/spl-token';

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
): Promise<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]> {
  try {
    // Get mint info to check if it's Token-2022
    const mintInfo = await getMintInfo(connection, mintAddress);
    const tokenProgramId = await getTokenProgramId(connection, mintAddress);
    
    if (!tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)) {
      return [];
    }

    // Get transfer hook program from mint
    const transferHook = getTransferHook(mintInfo);
    if (!transferHook) {
      return [];
    }

    const transferHookProgramId = transferHook.programId;

    // For the simple transfer hook example, we know it needs:
    // 1. The transfer hook program
    // 2. The extra account meta PDA
    // 3. The counter PDA
    const accounts = [];

    // Transfer hook program must be included
    accounts.push({ 
      pubkey: transferHookProgramId, 
      isSigner: false, 
      isWritable: false 
    });

    try {
      // Calculate extra account meta address
      const [extraAccountMetaAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('extra-account-metas'),
          mintAddress.toBuffer()
        ],
        transferHookProgramId
      );
      
      accounts.push({
        pubkey: extraAccountMetaAddress,
        isSigner: false,
        isWritable: false
      });

      // For the example transfer hook, add the counter PDA
      const [counterPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('counter')],
        transferHookProgramId
      );
      
      accounts.push({
        pubkey: counterPDA,
        isSigner: false,
        isWritable: true // Counter needs to be writable
      });
    } catch (error) {
      console.warn('Could not calculate extra accounts:', error);
    }

    return accounts;
  } catch (error) {
    console.warn('Error getting transfer hook accounts:', error);
    return [];
  }
}

export async function hasTransferHooks(
  connection: Connection,
  mintAddress: PublicKey
): Promise<boolean> {
  try {
    const tokenProgramId = await getTokenProgramId(connection, mintAddress);
    if (!tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)) {
      return false;
    }

    const mintInfo = await getMintInfo(connection, mintAddress);
    const transferHook = getTransferHook(mintInfo);
    return transferHook !== null;
  } catch {
    return false;
  }
}