import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createMint, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { HookAmm, formatSolAmount, parseSolAmount, getPDAs, IDL } from '../src';
import BN from 'bn.js';

const PROGRAM_ID = new PublicKey('9rftcX9CMpRaZJUteZ5yyY5bxy2LKSGRfp3xq9uP1SaC');

async function main() {
  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Initialize SDK - IDL is automatically loaded from the embedded version
  const hookAmm = new HookAmm(connection, PROGRAM_ID);
  
  // Or you can explicitly pass the IDL
  // const hookAmm = new HookAmm(connection, PROGRAM_ID, IDL);
  
  // Generate test keypairs
  const authority = Keypair.generate();
  const feeRecipient = Keypair.generate();
  const creator = Keypair.generate();
  const buyer = Keypair.generate();
  
  console.log('Generated test accounts:');
  console.log('Authority:', authority.publicKey.toString());
  console.log('Fee Recipient:', feeRecipient.publicKey.toString());
  console.log('Creator:', creator.publicKey.toString());
  console.log('Buyer:', buyer.publicKey.toString());
  
  // Airdrop SOL for testing
  console.log('\nRequesting airdrops...');
  await Promise.all([
    connection.requestAirdrop(authority.publicKey, 2 * LAMPORTS_PER_SOL),
    connection.requestAirdrop(creator.publicKey, 5 * LAMPORTS_PER_SOL),
    connection.requestAirdrop(buyer.publicKey, 5 * LAMPORTS_PER_SOL),
  ]);
  
  // Wait for confirmations
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Initialize global config (one-time setup)
  console.log('\nInitializing global config...');
  const initTx = await hookAmm.initializeGlobalConfig(
    authority,
    feeRecipient.publicKey
  );
  console.log('Init transaction:', initTx);
  
  // Create a new token mint
  console.log('\nCreating token mint...');
  const mint = await createMint(
    connection,
    creator,
    creator.publicKey,
    null,
    6, // 6 decimals
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log('Mint address:', mint.toString());
  
  // Create bonding curve with custom parameters
  console.log('\nCreating bonding curve...');
  const createTx = await hookAmm.createBondingCurve(
    creator,
    mint,
    {
      initialSupply: new BN(1_000_000_000_000), // 1M tokens with 6 decimals
      virtualTokenReserves: new BN(500_000_000_000_000), // 500M tokens
      virtualSolReserves: new BN(10_000_000_000), // 10 SOL
    }
  );
  console.log('Create curve transaction:', createTx);
  
  // Mint initial supply to curve
  console.log('\nMinting initial supply to curve...');
  const { curveTokenAccount } = getPDAs(PROGRAM_ID, mint);
  await mintTo(
    connection,
    creator,
    mint,
    curveTokenAccount,
    creator,
    1_000_000_000_000 // 1M tokens
  );
  
  // Get bonding curve data
  const bondingCurve = await hookAmm.getBondingCurve(mint);
  console.log('\nBonding curve data:', {
    mint: bondingCurve?.mint.toString(),
    creator: bondingCurve?.creator.toString(),
    virtualTokenReserves: bondingCurve?.virtualTokenReserves.toString(),
    virtualSolReserves: bondingCurve?.virtualSolReserves.toString(),
  });
  
  // Check initial price
  const initialPrice = await hookAmm.getPrice(mint);
  console.log('\nInitial price:', {
    pricePerToken: initialPrice?.pricePerToken,
    marketCap: formatSolAmount(new BN(initialPrice?.marketCap || 0)),
  });
  
  // Simulate a buy
  console.log('\nSimulating buy of 1 SOL...');
  const buyAmount = new BN(LAMPORTS_PER_SOL);
  const simulation = await hookAmm.simulateBuy(mint, buyAmount);
  console.log('Simulation results:', {
    expectedTokens: simulation.tokenAmount.toString(),
    fee: formatSolAmount(simulation.fee),
    priceImpact: simulation.priceImpact.toFixed(2) + '%',
  });
  
  // Create buyer token account
  console.log('\nCreating buyer token account...');
  await hookAmm.createTokenAccountIfNeeded(mint, buyer.publicKey, buyer);
  
  // Execute buy
  console.log('\nExecuting buy transaction...');
  const buyTx = await hookAmm.buy(
    buyer,
    mint,
    {
      solAmount: buyAmount,
      minTokenAmount: simulation.tokenAmount.muln(99).divn(100), // 1% slippage
    }
  );
  console.log('Buy transaction:', buyTx);
  
  // Check price after buy
  await new Promise(resolve => setTimeout(resolve, 2000));
  const priceAfterBuy = await hookAmm.getPrice(mint);
  console.log('\nPrice after buy:', {
    pricePerToken: priceAfterBuy?.pricePerToken,
    priceChange: ((priceAfterBuy!.pricePerToken - initialPrice!.pricePerToken) / initialPrice!.pricePerToken * 100).toFixed(2) + '%',
  });
  
  // Listen to events
  console.log('\nListening to trade events...');
  const listenerId = hookAmm.onTradeEvent((event) => {
    console.log('Trade event:', {
      type: event.isBuy ? 'BUY' : 'SELL',
      user: event.user.toString(),
      solAmount: formatSolAmount(event.solAmount),
      tokenAmount: event.tokenAmount.toString(),
    });
  });
  
  // Clean up listener after 30 seconds
  setTimeout(async () => {
    await hookAmm.removeEventListener(listenerId);
    console.log('Stopped listening to events');
  }, 30000);
}

// Run the example
main().catch(console.error);