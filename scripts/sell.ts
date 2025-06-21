#!/usr/bin/env ts-node

import { PublicKey, Keypair } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
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
 * Sell tokens to a bonding curve
 * 
 * Usage: ts-node sell.ts <mint_address> <token_amount> [slippage_percent]
 * Example: ts-node sell.ts 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 1000000 1
 */
async function sellTokens() {
  console.log('🚀 Selling tokens to HookAMM...\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('❌ Usage: ts-node sell.ts <mint_address> <token_amount> [slippage_percent]');
    console.log('Example: ts-node sell.ts 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 1000000 1');
    process.exit(1);
  }

  const mintAddress = args[0];
  const tokenAmount = parseInt(args[1]);
  const slippagePercent = parseFloat(args[2]) || 1; // Default 1% slippage

  if (tokenAmount <= 0) {
    console.log('❌ Token amount must be greater than 0');
    process.exit(1);
  }

  try {
    // Load seller keypair
    const seller = loadKeypair();
    console.log('Seller:', seller.publicKey.toString());

    // Ensure sufficient balance for transaction fees
    await ensureSufficientBalance(seller.publicKey, 0.1);

    // Create program instance
    const program = createProgram(seller);

    // Parse mint address
    const mint = new PublicKey(mintAddress);
    console.log('Token Mint:', mint.toString());

    // Get PDAs
    const { globalConfig, bondingCurve, curveTokenAccount } = getPDAs(mint);
    
    // Get bonding curve data
    console.log('\n📊 Fetching bonding curve data...');
    const curve = await (program.account as any).bondingCurve.fetch(bondingCurve);
    console.log('Bonding Curve:', bondingCurve.toString());

    // Calculate current price and expected output
    const effectiveSolReserves = curve.virtualSolReserves.add(curve.realSolReserves);
    const effectiveTokenReserves = curve.virtualTokenReserves.sub(curve.realTokenReserves);
    const currentPrice = effectiveSolReserves.toNumber() / effectiveTokenReserves.toNumber();
    
    console.log('Current State:');
    console.log('├── Effective SOL Reserves:', effectiveSolReserves.toString(), 'lamports');
    console.log('├── Effective Token Reserves:', effectiveTokenReserves.toString());
    console.log('└── Current Price:', currentPrice.toFixed(9), 'SOL per token');

    // Calculate trade details
    const tokenAmountBN = new BN(tokenAmount);

    // Simulate trade using constant product formula
    const k = effectiveSolReserves.mul(effectiveTokenReserves);
    const newTokenReserves = effectiveTokenReserves.add(tokenAmountBN);
    const newSolReserves = k.div(newTokenReserves);
    const solOut = effectiveSolReserves.sub(newSolReserves);

    // Apply fee (1% on SOL output)
    const fee = solOut.muln(1).divn(100); // 1% fee
    const solAfterFee = solOut.sub(fee);

    // Apply slippage protection
    const minSolOut = solAfterFee.muln(100 - slippagePercent).divn(100);

    console.log('\nTrade Simulation:');
    console.log('├── Token Input:', tokenAmount);
    console.log('├── Expected SOL Out:', solOut.toNumber() / 1e9, 'SOL');
    console.log('├── Fee (1%):', fee.toNumber() / 1e9, 'SOL');
    console.log('├── SOL After Fee:', solAfterFee.toNumber() / 1e9, 'SOL');
    console.log('├── Min SOL (slippage):', minSolOut.toNumber() / 1e9, 'SOL');
    console.log('└── Effective Price:', (solAfterFee.toNumber() / 1e9) / (tokenAmount / 1e6), 'SOL per token');

    // Get global config for fee recipient
    const globalConfigData = await (program.account as any).globalConfig.fetch(globalConfig);
    console.log('Fee Recipient:', globalConfigData.feeRecipient.toString());

    // Determine token program
    const tokenProgramId = await getTokenProgramForMint(mint);
    console.log('Token Program:', tokenProgramId.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token');

    // Get seller token account
    console.log('\n🏦 Getting seller token account...');
    const sellerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      seller,
      mint,
      seller.publicKey,
      false,
      'confirmed',
      undefined,
      tokenProgramId
    );
    console.log('Seller Token Account:', sellerTokenAccount.address.toString());

    // Check token balance
    const tokenBalance = await connection.getTokenAccountBalance(sellerTokenAccount.address);
    const currentTokenBalance = parseInt(tokenBalance.value.amount);
    
    if (currentTokenBalance < tokenAmount) {
      console.log(`❌ Insufficient token balance: ${currentTokenBalance} < ${tokenAmount}`);
      process.exit(1);
    }

    // Get initial balances
    const initialSolBalance = await connection.getBalance(seller.publicKey);
    const initialTokenBalance = await connection.getTokenAccountBalance(sellerTokenAccount.address);
    
    console.log('\nInitial Balances:');
    console.log('├── SOL Balance:', initialSolBalance / 1e9, 'SOL');
    console.log('└── Token Balance:', initialTokenBalance.value.amount);

    // Execute sell transaction
    console.log('\n📝 Executing sell transaction...');
    const sellTx = await program.methods
      .sell(tokenAmountBN, minSolOut)
      .accounts({
        bondingCurve,
        curveTokenAccount,
        userTokenAccount: sellerTokenAccount.address,
        user: seller.publicKey,
        mint,
        globalConfig,
        feeRecipient: globalConfigData.feeRecipient,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SYSTEM_PROGRAM_ID,
        rent: RENT_SYSVAR_ID,
      })
      .signers([seller])
      .rpc();

    console.log('✅ Sell transaction successful!');
    console.log('Transaction signature:', sellTx);
    console.log('Explorer:', `https://explorer.solana.com/tx/${sellTx}?cluster=devnet`);

    // Wait for confirmation and get final balances
    await connection.confirmTransaction(sellTx, 'confirmed');
    
    console.log('\n🔍 Checking final balances...');
    const finalSolBalance = await connection.getBalance(seller.publicKey);
    const finalTokenBalance = await connection.getTokenAccountBalance(sellerTokenAccount.address);
    
    const solReceived = (finalSolBalance - initialSolBalance) / 1e9;
    const tokensSold = parseInt(initialTokenBalance.value.amount) - parseInt(finalTokenBalance.value.amount);

    console.log('Final Balances:');
    console.log('├── SOL Balance:', finalSolBalance / 1e9, 'SOL');
    console.log('├── Token Balance:', finalTokenBalance.value.amount);
    console.log('├── SOL Received:', solReceived.toFixed(4), 'SOL');
    console.log('├── Tokens Sold:', tokensSold);
    console.log('└── Effective Price:', (solReceived / (tokensSold / 1e6)).toFixed(9), 'SOL per token');

    // Get updated curve data
    const updatedCurve = await (program.account as any).bondingCurve.fetch(bondingCurve);
    const newEffectiveSolReserves = updatedCurve.virtualSolReserves.add(updatedCurve.realSolReserves);
    const newEffectiveTokenReserves = updatedCurve.virtualTokenReserves.sub(updatedCurve.realTokenReserves);
    const newPrice = newEffectiveSolReserves.toNumber() / newEffectiveTokenReserves.toNumber();

    console.log('\nUpdated Curve State:');
    console.log('├── Real SOL Reserves:', updatedCurve.realSolReserves.toString(), 'lamports');
    console.log('├── Real Token Reserves:', updatedCurve.realTokenReserves.toString());
    console.log('├── New Current Price:', newPrice.toFixed(9), 'SOL per token');
    console.log('└── Price Change:', ((newPrice - currentPrice) / currentPrice * 100).toFixed(2), '%');

    console.log('\n🎉 Sale completed successfully!');

  } catch (error) {
    console.error('❌ Error selling tokens:', error);
    
    if (error.message?.includes('SlippageExceeded')) {
      console.log('💡 Try increasing slippage tolerance or reducing trade size');
    } else if (error.message?.includes('insufficient funds')) {
      console.log('💡 Make sure you have enough tokens to sell');
    } else if (error.message?.includes('TokenAccountNotFoundError')) {
      console.log('💡 Make sure you have a token account with tokens to sell');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  sellTokens();
}