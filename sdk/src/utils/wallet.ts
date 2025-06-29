import { Connection, PublicKey, Transaction, Keypair, TransactionSignature } from '@solana/web3.js';
import { WalletAdapter, SignerType, SendTransactionOptions } from '../types/wallet';

/**
 * Utility functions for wallet operations
 */

/**
 * Check if a signer is a Keypair
 */
export function isKeypair(signer: SignerType): signer is Keypair {
  return signer instanceof Keypair || (signer as any).secretKey !== undefined;
}

/**
 * Check if a signer is a WalletAdapter
 */
export function isWalletAdapter(signer: SignerType): signer is WalletAdapter {
  return !isKeypair(signer) && (signer as WalletAdapter).publicKey !== undefined;
}

/**
 * Get the public key from any signer type
 */
export function getSignerPublicKey(signer: SignerType): PublicKey {
  if (isKeypair(signer)) {
    return signer.publicKey;
  }
  
  if (isWalletAdapter(signer) && signer.publicKey) {
    return signer.publicKey;
  }
  
  throw new Error('Invalid signer: no public key available');
}

/**
 * Sign a transaction with any signer type
 */
export async function signTransaction(
  transaction: Transaction,
  signer: SignerType
): Promise<Transaction> {
  if (isKeypair(signer)) {
    transaction.sign(signer);
    return transaction;
  }
  
  if (isWalletAdapter(signer) && signer.signTransaction) {
    return await signer.signTransaction(transaction);
  }
  
  throw new Error('Signer does not support transaction signing');
}

/**
 * Sign multiple transactions with any signer type
 */
export async function signAllTransactions(
  transactions: Transaction[],
  signer: SignerType
): Promise<Transaction[]> {
  if (isKeypair(signer)) {
    return transactions.map(tx => {
      tx.sign(signer);
      return tx;
    });
  }
  
  if (isWalletAdapter(signer) && signer.signAllTransactions) {
    return await signer.signAllTransactions(transactions);
  }
  
  if (isWalletAdapter(signer) && signer.signTransaction) {
    // Fallback: sign transactions one by one
    const signedTxs = [];
    for (const tx of transactions) {
      signedTxs.push(await signer.signTransaction(tx));
    }
    return signedTxs;
  }
  
  throw new Error('Signer does not support transaction signing');
}

/**
 * Send a transaction with any signer type
 */
export async function sendTransaction(
  connection: Connection,
  transaction: Transaction,
  signer: SignerType,
  options: SendTransactionOptions = {}
): Promise<TransactionSignature> {
  // Set recent blockhash if not set
  if (!transaction.recentBlockhash) {
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
  }
  
  // Set fee payer if not set
  if (!transaction.feePayer) {
    transaction.feePayer = getSignerPublicKey(signer);
  }
  
  if (isKeypair(signer)) {
    // For keypairs, sign and send manually
    transaction.sign(signer);
    return await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: options.skipPreflight,
      preflightCommitment: options.preflightCommitment,
      maxRetries: options.maxRetries,
      minContextSlot: options.minContextSlot,
    });
  }
  
  if (isWalletAdapter(signer)) {
    // Try wallet's sendTransaction first
    if (signer.sendTransaction) {
      return await signer.sendTransaction(transaction, connection, options);
    }
    
    // Fallback: sign then send manually
    if (signer.signTransaction) {
      const signedTx = await signer.signTransaction(transaction);
      return await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: options.skipPreflight,
        preflightCommitment: options.preflightCommitment,
        maxRetries: options.maxRetries,
        minContextSlot: options.minContextSlot,
      });
    }
  }
  
  throw new Error('Unable to send transaction with provided signer');
}

/**
 * Send multiple transactions with any signer type
 */
export async function sendAllTransactions(
  connection: Connection,
  transactions: Transaction[],
  signer: SignerType,
  options: SendTransactionOptions = {}
): Promise<TransactionSignature[]> {
  const signatures: TransactionSignature[] = [];
  
  for (const transaction of transactions) {
    const signature = await sendTransaction(connection, transaction, signer, options);
    signatures.push(signature);
    
    // Wait for confirmation before sending next transaction
    if (options.preflightCommitment !== 'processed') {
      await connection.confirmTransaction(signature, options.preflightCommitment || 'confirmed');
    }
  }
  
  return signatures;
}

/**
 * Create a wallet adapter from a keypair (for testing/backwards compatibility)
 */
export function createWalletFromKeypair(keypair: Keypair): WalletAdapter {
  return {
    publicKey: keypair.publicKey,
    
    async signTransaction(transaction: Transaction): Promise<Transaction> {
      transaction.sign(keypair);
      return transaction;
    },
    
    async signAllTransactions(transactions: Transaction[]): Promise<Transaction[]> {
      return transactions.map(tx => {
        tx.sign(keypair);
        return tx;
      });
    },
    
    async sendTransaction(
      transaction: Transaction,
      connection: Connection,
      options: any = {}
    ): Promise<string> {
      if (!transaction.recentBlockhash) {
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
      }
      
      if (!transaction.feePayer) {
        transaction.feePayer = keypair.publicKey;
      }
      
      transaction.sign(keypair);
      return await connection.sendRawTransaction(transaction.serialize(), options);
    }
  };
}