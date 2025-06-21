import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program, Idl } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import bs58 from 'bs58';

// Load environment variables
dotenv.config();

// Program ID (updated with your deployed program)
export const PROGRAM_ID = new PublicKey('3knogLoPGGJJkda28BjN5N2LCcmEmoyyrua9THojndQr');

// Connection to devnet
export const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Load keypair from .env PRIVATE_KEY or fallback to file
export function loadKeypair(keypairPath?: string): Keypair {
  // Try to load from environment variable first
  if (process.env.PRIVATE_KEY) {
    try {
      // Handle base58 encoded private key
      const secretKey = bs58.decode(process.env.PRIVATE_KEY);
      return Keypair.fromSecretKey(secretKey);
    } catch (error) {
      console.error('Failed to load keypair from PRIVATE_KEY environment variable:', error);
      console.log('Falling back to file-based keypair...');
    }
  }

  // Fallback to file-based keypair
  const defaultPath = path.join(process.env.HOME || '~', '.config/solana/id.json');
  const keyPath = keypairPath || defaultPath;

  try {
    const secretKeyString = fs.readFileSync(keyPath, 'utf8');
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error(`Failed to load keypair from ${keyPath}:`, error);
    console.log('Generating new keypair...');
    return Keypair.generate();
  }
}

// Load IDL
export function loadIdl(): Idl {
  const idlPath = path.join(__dirname, '../target/idl/hook_amm.json');
  return JSON.parse(fs.readFileSync(idlPath, 'utf8'));
}

// Create provider and program
export function createProgram(wallet?: Keypair): Program {
  const payer = wallet || loadKeypair();
  const provider = new AnchorProvider(
    connection,
    new Wallet(payer),
    { commitment: 'confirmed' }
  );

  const idl = loadIdl();
  return new Program(idl, provider);
}

// Helper to get PDAs
export function getPDAs(mint?: PublicKey) {
  const [globalConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from('global_config')],
    PROGRAM_ID
  );

  if (!mint) {
    return { globalConfig };
  }

  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding_curve'), mint.toBuffer()],
    PROGRAM_ID
  );

  const [curveTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('curve_token_account'), mint.toBuffer()],
    PROGRAM_ID
  );

  return {
    globalConfig,
    bondingCurve,
    curveTokenAccount
  };
}

// Helper to airdrop SOL if needed
export async function ensureSufficientBalance(
  publicKey: PublicKey,
  minBalance: number = 1
): Promise<void> {
  const balance = await connection.getBalance(publicKey);
  const minLamports = minBalance * 1e9; // Convert to lamports

  if (balance < minLamports) {
    console.log(`Balance too low (${balance / 1e9} SOL), requesting airdrop...`);
    const signature = await connection.requestAirdrop(publicKey, 2 * 1e9); // Request 2 SOL
    await connection.confirmTransaction(signature);
    console.log('Airdrop completed');
  }
}

// Constants
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);

export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
export const RENT_SYSVAR_ID = new PublicKey('SysvarRent111111111111111111111111111111111');

// Helper to get the correct token program for a mint
export async function getTokenProgramForMint(mint: PublicKey): Promise<PublicKey> {
  try {
    // Try Token-2022 first
    const { getMint: getMint2022 } = await import('@solana/spl-token');
    await getMint2022(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
    return TOKEN_2022_PROGRAM_ID;
  } catch (error) {
    // If that fails, it's a regular SPL token
    return TOKEN_PROGRAM_ID;
  }
}
