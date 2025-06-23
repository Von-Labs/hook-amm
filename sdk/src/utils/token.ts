import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { 
  TOKEN_2022_PROGRAM_ID, 
  TOKEN_PROGRAM_ID, 
  getMint, 
  Mint,
  getTransferHook,
  getExtraAccountMetaAddress,
  getExtraAccountMetas
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
    
    // Only Token-2022 can have transfer hooks
    if (!tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)) {
      return [];
    }

    // Get transfer hook program from mint
    const transferHookProgramId = getTransferHook(mintInfo);
    if (!transferHookProgramId) {
      return [];
    }

    const accounts = [
      // Transfer hook program must be first
      { 
        pubkey: transferHookProgramId, 
        isSigner: false, 
        isWritable: false 
      }
    ];

    try {
      // Get extra account meta address
      const extraAccountMetaAddress = getExtraAccountMetaAddress(
        mintAddress, 
        transferHookProgramId
      );
      
      accounts.push({
        pubkey: extraAccountMetaAddress,
        isSigner: false,
        isWritable: false
      });

      // Get extra account metas from the hook program
      const extraAccountMetas = await getExtraAccountMetas(
        connection,
        extraAccountMetaAddress,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      );

      // Add hook-specific accounts
      for (const meta of extraAccountMetas) {
        // Resolve PDA accounts for seeds-based metas
        if (meta.addressConfig && 'seeds' in meta.addressConfig) {
          const seeds = meta.addressConfig.seeds;
          let resolvedAddress: PublicKey;
          
          // Handle common seed patterns
          if (seeds.some(seed => seed.toString().includes('counter'))) {
            // Counter PDA: ["counter"]
            const [counterPDA] = PublicKey.findProgramAddressSync(
              [Buffer.from('counter')],
              transferHookProgramId
            );
            resolvedAddress = counterPDA;
          } else {
            // Default handling - try to resolve the address
            try {
              resolvedAddress = meta.addressConfig.address;
            } catch {
              continue; // Skip if we can't resolve
            }
          }
          
          accounts.push({
            pubkey: resolvedAddress,
            isSigner: meta.isSigner || false,
            isWritable: meta.isWritable || false
          });
        } else if (meta.addressConfig && 'address' in meta.addressConfig) {
          accounts.push({
            pubkey: meta.addressConfig.address,
            isSigner: meta.isSigner || false,
            isWritable: meta.isWritable || false
          });
        }
      }
    } catch (error) {
      console.warn('Could not fetch extra account metas:', error);
      // Still return the hook program if we can't get extra accounts
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
    const transferHookProgramId = getTransferHook(mintInfo);
    return transferHookProgramId !== null;
  } catch {
    return false;
  }
}