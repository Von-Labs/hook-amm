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
 * Buy tokens from a bonding curve
 * 
 * Usage: ts-node buy.ts <mint_address> <sol_amount> [slippage_percent]
 * Example: ts-node buy.ts 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 0.1 1
 */
async function buyTokens() {
  console.log('🚀 Buying tokens from HookAMM...\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('❌ Usage: ts-node buy.ts <mint_address> <sol_amount> [slippage_percent]');
    console.log('Example: ts-node buy.ts 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 0.1 1');
    process.exit(1);
  }

  const mintAddress = args[0];
  const solAmount = parseFloat(args[1]);
  const slippagePercent = parseFloat(args[2]) || 1; // Default 1% slippage

  if (solAmount <= 0) {
    console.log('❌ SOL amount must be greater than 0');
    process.exit(1);
  }

  try {
    // Load buyer keypair
    const buyer = loadKeypair();
    console.log('Buyer:', buyer.publicKey.toString());

    // Ensure sufficient balance
    await ensureSufficientBalance(buyer.publicKey, solAmount + 0.1);

    // Create program instance
    const program = createProgram(buyer);

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
    const currentPrice = parseFloat(effectiveSolReserves.toString()) / parseFloat(effectiveTokenReserves.toString());
    
    console.log('Current State:');
    console.log('├── Effective SOL Reserves:', effectiveSolReserves.toString(), 'lamports');
    console.log('├── Effective Token Reserves:', effectiveTokenReserves.toString());
    console.log('└── Current Price:', currentPrice.toFixed(9), 'SOL per token');

    // Calculate trade details
    const solAmountLamports = new BN(solAmount * 1e9); // Convert to lamports
    const fee = solAmountLamports.muln(1).divn(100); // 1% fee
    const solAfterFee = solAmountLamports.sub(fee);

    // Simulate trade using constant product formula
    const k = effectiveSolReserves.mul(effectiveTokenReserves);
    const newSolReserves = effectiveSolReserves.add(solAfterFee);
    const newTokenReserves = k.div(newSolReserves);
    const tokensOut = effectiveTokenReserves.sub(newTokenReserves);

    // Apply slippage protection
    const minTokensOut = tokensOut.muln(100 - slippagePercent).divn(100);

    console.log('\nTrade Simulation:');
    console.log('├── SOL Input:', solAmount, 'SOL');
    console.log('├── Fee (1%):', fee.toNumber() / 1e9, 'SOL');
    console.log('├── SOL After Fee:', solAfterFee.toNumber() / 1e9, 'SOL');
    console.log('├── Expected Tokens Out:', tokensOut.toString());
    console.log('├── Min Tokens (slippage):', minTokensOut.toString());
    const effectivePrice = parseFloat(solAfterFee.toString()) / parseFloat(tokensOut.toString());
    console.log('└── Effective Price:', effectivePrice.toFixed(12), 'SOL per token base unit');

    // Get global config for fee recipient
    const globalConfigData = await (program.account as any).globalConfig.fetch(globalConfig);
    console.log('Fee Recipient:', globalConfigData.feeRecipient.toString());

    // Determine token program
    const tokenProgramId = await getTokenProgramForMint(mint);
    console.log('Token Program:', tokenProgramId.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : 'Token');

    // Create or get buyer token account
    console.log('\n🏦 Setting up buyer token account...');
    const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      buyer,
      mint,
      buyer.publicKey,
      false,
      'confirmed',
      undefined,
      tokenProgramId
    );
    console.log('Buyer Token Account:', buyerTokenAccount.address.toString());

    // Get initial balances
    const initialSolBalance = await connection.getBalance(buyer.publicKey);
    const initialTokenBalance = await connection.getTokenAccountBalance(buyerTokenAccount.address);
    
    console.log('\nInitial Balances:');
    console.log('├── SOL Balance:', initialSolBalance / 1e9, 'SOL');
    console.log('└── Token Balance:', initialTokenBalance.value.amount);

    // Execute buy transaction
    console.log('\n📝 Executing buy transaction...');
    const buyTx = await program.methods
      .buy(solAmountLamports, minTokensOut)
      .accounts({
        bondingCurve,
        curveTokenAccount,
        userTokenAccount: buyerTokenAccount.address,
        user: buyer.publicKey,
        mint,
        globalConfig,
        feeRecipient: globalConfigData.feeRecipient,
        tokenProgram: tokenProgramId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SYSTEM_PROGRAM_ID,
        rent: RENT_SYSVAR_ID,
      })
      .signers([buyer])
      .rpc();

    console.log('✅ Buy transaction successful!');
    console.log('Transaction signature:', buyTx);
    console.log('Explorer:', `https://explorer.solana.com/tx/${buyTx}?cluster=devnet`);

    // Wait for confirmation and get final balances
    await connection.confirmTransaction(buyTx, 'confirmed');
    
    console.log('\n🔍 Checking final balances...');
    const finalSolBalance = await connection.getBalance(buyer.publicKey);
    const finalTokenBalance = await connection.getTokenAccountBalance(buyerTokenAccount.address);
    
    const solSpent = (initialSolBalance - finalSolBalance) / 1e9;
    const tokensReceived = parseInt(finalTokenBalance.value.amount) - parseInt(initialTokenBalance.value.amount);

    console.log('Final Balances:');
    console.log('├── SOL Balance:', finalSolBalance / 1e9, 'SOL');
    console.log('├── Token Balance:', finalTokenBalance.value.amount);
    console.log('├── SOL Spent:', solSpent.toFixed(4), 'SOL');
    console.log('├── Tokens Received:', tokensReceived);
    console.log('└── Effective Price:', (solSpent * 1e9 / tokensReceived).toFixed(12), 'SOL per token base unit');

    // Get updated curve data
    const updatedCurve = await (program.account as any).bondingCurve.fetch(bondingCurve);
    const newEffectiveSolReserves = updatedCurve.virtualSolReserves.add(updatedCurve.realSolReserves);
    const newEffectiveTokenReserves = updatedCurve.virtualTokenReserves.sub(updatedCurve.realTokenReserves);
    const newPrice = parseFloat(newEffectiveSolReserves.toString()) / parseFloat(newEffectiveTokenReserves.toString());

    console.log('\nUpdated Curve State:');
    console.log('├── Real SOL Reserves:', updatedCurve.realSolReserves.toString(), 'lamports');
    console.log('├── Real Token Reserves:', updatedCurve.realTokenReserves.toString());
    console.log('├── New Current Price:', newPrice.toFixed(9), 'SOL per token');
    console.log('└── Price Change:', ((newPrice - currentPrice) / currentPrice * 100).toFixed(2), '%');

    console.log('\n🎉 Purchase completed successfully!');

  } catch (error) {
    console.error('❌ Error buying tokens:', error);
    
    if (error.message?.includes('SlippageExceeded')) {
      console.log('💡 Try increasing slippage tolerance or reducing trade size');
    } else if (error.message?.includes('insufficient funds')) {
      console.log('💡 Make sure you have enough SOL for the trade + fees');
    } else if (error.message?.includes('TokenAccountNotFoundError')) {
      console.log('💡 Creating associated token account...');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  buyTokens();
}