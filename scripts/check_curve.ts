#!/usr/bin/env ts-node

import { PublicKey } from '@solana/web3.js';
import { 
  createProgram, 
  loadKeypair, 
  getPDAs,
  connection
} from './config';

/**
 * Check bonding curve state
 * 
 * Usage: ts-node check_curve.ts <mint_address>
 */
async function checkCurve() {
  console.log('🔍 Checking bonding curve state...\n');

  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('❌ Usage: ts-node check_curve.ts <mint_address>');
    process.exit(1);
  }

  const mintAddress = args[0];

  try {
    const payer = loadKeypair();
    const mint = new PublicKey(mintAddress);
    console.log('Token Mint:', mint.toString());

    const { bondingCurve, curveTokenAccount } = getPDAs(mint);
    console.log('Bonding Curve:', bondingCurve.toString());
    console.log('Curve Token Account:', curveTokenAccount.toString());

    const program = createProgram(payer);
    const curve = await (program.account as any).bondingCurve.fetch(bondingCurve);
    
    console.log('\n📊 Bonding Curve State:');
    console.log('├── Virtual Token Reserves:', curve.virtualTokenReserves.toString());
    console.log('├── Virtual SOL Reserves:', curve.virtualSolReserves.toString());
    console.log('├── Real Token Reserves:', curve.realTokenReserves.toString());
    console.log('├── Real SOL Reserves:', curve.realSolReserves.toString());
    console.log('├── Token Total Supply:', curve.tokenTotalSupply.toString());
    console.log('└── Complete:', curve.complete);

    // Check token account balance
    try {
      const balance = await connection.getTokenAccountBalance(curveTokenAccount);
      console.log('\n🏦 Curve Token Balance:', balance.value.amount);
      
      if (balance.value.amount === '0') {
        console.log('❌ WARNING: Curve has no tokens! You need to transfer tokens to the curve.');
      }
    } catch (error) {
      console.log('\n🏦 Curve Token Account: Not created yet');
    }

    // Calculate effective reserves
    const effectiveSol = curve.virtualSolReserves.add(curve.realSolReserves);
    const effectiveTokens = curve.virtualTokenReserves.sub(curve.realTokenReserves);
    
    console.log('\n💰 Effective Reserves:');
    console.log('├── SOL:', effectiveSol.toString());
    console.log('└── Tokens:', effectiveTokens.toString());
    
    if (effectiveTokens.lten(0)) {
      console.log('\n❌ ERROR: Effective token reserves are negative!');
      console.log('This means more tokens were removed than the virtual reserves.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

if (require.main === module) {
  checkCurve();
}