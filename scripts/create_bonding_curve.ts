#!/usr/bin/env ts-node

import { PublicKey, Keypair } from '@solana/web3.js';
import { getMint, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import BN from 'bn.js';
import { 
  createProgram, 
  loadKeypair, 
  getPDAs, 
  ensureSufficientBalance,
  connection,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  RENT_SYSVAR_ID,
  getTokenProgramForMint
} from './config';

/**
 * Create a new bonding curve with customizable parameters
 * 
 * Usage: ts-node create_bonding_curve.ts <mint_address> [virtual_token_reserves] [virtual_sol_reserves]
 * Example: ts-node create_bonding_curve.ts 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 500000000000000 10000000000
 */
async function createBondingCurve() {
  console.log('🚀 Creating HookAMM Bonding Curve...\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('❌ Usage: ts-node create_bonding_curve.ts <mint_address> [virtual_token_reserves] [virtual_sol_reserves]');
    console.log('Example: ts-node create_bonding_curve.ts 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 500000000000000 10000000000');
    process.exit(1);
  }

  const mintAddress = args[0];
  const virtualTokenReserves = args[1] ? new BN(args[1]) : new BN(500_000_000_000_000); // Default: 500M tokens
  const virtualSolReserves = args[2] ? new BN(args[2]) : new BN(10_000_000_000); // Default: 10 SOL

  try {
    // Load creator keypair
    const creator = loadKeypair();
    console.log('Creator:', creator.publicKey.toString());

    // Ensure sufficient balance
    await ensureSufficientBalance(creator.publicKey, 2);

    // Create program instance
    const program = createProgram(creator);

    // Parse mint address
    const mint = new PublicKey(mintAddress);
    console.log('Token Mint:', mint.toString());

    // Get mint info to determine initial supply and token program
    console.log('\n🔍 Fetching mint information...');
    const tokenProgramId = await getTokenProgramForMint(mint);
    const mintInfo = await getMint(connection, mint, 'confirmed', tokenProgramId);
    console.log('Token Program:', tokenProgramId.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token');
    console.log('Mint Authority:', mintInfo.mintAuthority?.toString() || 'None');
    console.log('Total Supply:', mintInfo.supply.toString());
    console.log('Decimals:', mintInfo.decimals);

    // Check if creator has mint authority
    if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(creator.publicKey)) {
      console.log('❌ Error: You must be the mint authority to create a bonding curve');
      console.log('Current mint authority:', mintInfo.mintAuthority?.toString());
      console.log('Your address:', creator.publicKey.toString());
      process.exit(1);
    }

    // Use total supply as initial supply (or a portion of it if you want to mint more)
    const initialSupply = new BN(mintInfo.supply.toString());

    // Bonding curve parameters
    const params = {
      initialSupply,
      virtualTokenReserves,
      virtualSolReserves,
    };

    console.log('\nBonding Curve Parameters:');
    console.log('├── Initial Supply:', params.initialSupply.toString(), 'tokens (from total supply)');
    console.log('├── Virtual Token Reserves:', params.virtualTokenReserves.toString());
    console.log('└── Virtual SOL Reserves:', params.virtualSolReserves.toString(), 'lamports');

    // Calculate initial price (handle large numbers)
    const solReservesStr = params.virtualSolReserves.toString();
    const tokenReservesStr = params.virtualTokenReserves.toString();
    const initialPrice = parseFloat(solReservesStr) / parseFloat(tokenReservesStr);
    console.log('├── Initial Price:', initialPrice.toFixed(12), 'SOL per token');

    // Get PDAs
    const { globalConfig, bondingCurve, curveTokenAccount } = getPDAs(mint);
    console.log('\nPDA Addresses:');
    console.log('├── Global Config:', globalConfig.toString());
    console.log('├── Bonding Curve:', bondingCurve.toString());
    console.log('└── Curve Token Account:', curveTokenAccount.toString());

    // Check if bonding curve already exists
    try {
      const existingCurve = await (program.account as any).bondingCurve.fetch(bondingCurve);
      console.log('❌ Bonding curve already exists for this mint!');
      console.log('Creator:', existingCurve.creator.toString());
      return;
    } catch (error) {
      console.log('✅ Bonding curve not found, proceeding with creation...');
    }

    // Get creator token account
    console.log('\n🏦 Getting creator token account...');
    const creatorTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      creator,
      mint,
      creator.publicKey,
      false,
      'confirmed',
      undefined,
      tokenProgramId
    );
    console.log('Creator Token Account:', creatorTokenAccount.address.toString());

    // Check creator has all tokens
    const creatorBalance = await connection.getTokenAccountBalance(creatorTokenAccount.address);
    console.log('Creator Token Balance:', creatorBalance.value.amount);
    
    if (parseInt(creatorBalance.value.amount) !== initialSupply.toNumber()) {
      console.log('❌ Error: Creator must have ALL tokens');
      console.log('Required:', initialSupply.toString());
      console.log('Current:', creatorBalance.value.amount);
      process.exit(1);
    }

    // Create bonding curve
    console.log('\n📝 Creating bonding curve...');
    const createTx = await program.methods
      .createBondingCurve(params)
      .accounts({
        bondingCurve,
        curveTokenAccount,
        mint,
        creatorTokenAccount: creatorTokenAccount.address,
        creator: creator.publicKey,
        globalConfig,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SYSTEM_PROGRAM_ID,
        rent: RENT_SYSVAR_ID,
      })
      .signers([creator])
      .rpc();

    console.log('✅ Bonding curve created and tokens transferred!');
    console.log('Transaction signature:', createTx);
    console.log('Explorer:', `https://explorer.solana.com/tx/${createTx}?cluster=devnet`);
    console.log('✅ Mint authority has been frozen - no one can mint more tokens');

    // Verify bonding curve creation
    console.log('\n🔍 Verifying bonding curve...');
    const curve = await (program.account as any).bondingCurve.fetch(bondingCurve);
    
    console.log('Bonding Curve Details:');
    console.log('├── Mint:', curve.mint.toString());
    console.log('├── Creator:', curve.creator.toString());
    console.log('├── Virtual Token Reserves:', curve.virtualTokenReserves.toString());
    console.log('├── Virtual SOL Reserves:', curve.virtualSolReserves.toString());
    console.log('├── Real Token Reserves:', curve.realTokenReserves.toString());
    console.log('├── Real SOL Reserves:', curve.realSolReserves.toString());
    console.log('├── Token Total Supply:', curve.tokenTotalSupply.toString());
    console.log('├── Complete:', curve.complete);
    console.log('└── Index:', curve.index.toString());

    // Get curve token account balance
    const tokenBalance = await connection.getTokenAccountBalance(curveTokenAccount);
    console.log('\nCurve Token Account:');
    console.log('├── Address:', curveTokenAccount.toString());
    console.log('└── Balance:', tokenBalance.value.amount, 'tokens');

    console.log('\n🎉 Bonding curve created successfully!');
    console.log('📝 Save these details for trading:');
    console.log('├── Mint Address:', mint.toString());
    console.log('├── Bonding Curve PDA:', bondingCurve.toString());
    console.log('└── Initial Price:', initialPrice.toFixed(9), 'SOL per token');
    
    console.log('\n💡 You can now trade using buy.ts and sell.ts scripts');

  } catch (error) {
    console.error('❌ Error creating bonding curve:', error);
    
    if (error.message?.includes('InvalidAmount')) {
      console.log('💡 Check that all parameters are greater than 0');
    } else if (error.message?.includes('GlobalConfig')) {
      console.log('💡 Make sure to run init.ts first to initialize global config');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createBondingCurve();
}