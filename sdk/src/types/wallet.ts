import { PublicKey, Transaction, VersionedTransaction, Keypair } from '@solana/web3.js';

/**
 * Wallet adapter interface compatible with @solana/wallet-adapter-base
 */
export interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
  signAllTransactions?(transactions: Transaction[]): Promise<Transaction[]>;
  sendTransaction?(
    transaction: Transaction, 
    connection: any, 
    options?: any
  ): Promise<string>;
}

/**
 * Union type for supported signer types
 */
export type SignerType = Keypair | WalletAdapter;

/**
 * Helper interface for wallet operations
 */
export interface WalletContextType {
  wallet: WalletAdapter | null;
  publicKey: PublicKey | null;
  connected: boolean;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  sendTransaction?: (
    transaction: Transaction,
    connection: any,
    options?: any
  ) => Promise<string>;
}

/**
 * Options for transaction sending
 */
export interface SendTransactionOptions {
  skipPreflight?: boolean;
  preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
  maxRetries?: number;
  minContextSlot?: number;
}