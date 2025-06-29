import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { HookAmmClient, HookAmmIdl } from '../src';
import BN from 'bn.js';

// Example showing how to use HookAMM with Token-2022 transfer hooks
async function transferHooksExample() {
  // Setup connection and wallet
  const connection = new Connection('https://api.devnet.solana.com');
  const wallet = Keypair.generate(); // In real use, load your wallet
  
  // Initialize HookAMM client with built-in IDL
  const hookAmm = new HookAmmClient(connection, { publicKey: wallet.publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs }, HookAmmIdl);

  // Example Token-2022 mint with transfer hooks
  const tokenMint = new PublicKey('YOUR_TOKEN_2022_MINT_WITH_HOOKS');
  
  try {
    // 1. Check if token has transfer hooks
    console.log('🔍 Checking if token has transfer hooks...');
    const hasHooks = await hookAmm.isTokenWithHooks(tokenMint);
    console.log(`Token has transfer hooks: ${hasHooks}`);

    if (hasHooks) {
      console.log('✅ This token uses transfer hooks - HookAMM will handle them automatically!');
    }

    // 2. Get bonding curve for the token
    const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding_curve'), tokenMint.toBuffer()],
      new PublicKey('YOUR_HOOK_AMM_PROGRAM_ID')
    );

    // 3. Get quote for buying tokens
    console.log('💰 Getting buy quote...');
    const solAmount = new BN(1_000_000_000); // 1 SOL
    const buyQuote = await hookAmm.getBuyQuote(bondingCurvePDA, solAmount);
    
    console.log(`Quote: ${buyQuote.tokenAmount.toString()} tokens for ${solAmount.toString()} lamports`);
    console.log(`Fee: ${buyQuote.fee.toString()} lamports`);
    console.log(`Price per token: ${buyQuote.pricePerToken.toString()} SOL`);
    console.log(`Price impact: ${buyQuote.priceImpact.toString()}%`);

    // 4. Buy tokens (automatically handles transfer hooks)
    console.log('🛒 Buying tokens...');
    const buyParams = {
      bondingCurve: bondingCurvePDA,
      solAmount: solAmount,
      minTokenAmount: buyQuote.tokenAmount.mul(new BN(95)).div(new BN(100)) // 5% slippage
    };

    const buyTx = await hookAmm.buy(buyParams, wallet);
    console.log(`✅ Buy transaction: ${buyTx}`);

    // 5. Get quote for selling tokens
    console.log('💸 Getting sell quote...');
    const tokenAmount = new BN(100_000_000); // 100 tokens (assuming 6 decimals)
    const sellQuote = await hookAmm.getSellQuote(bondingCurvePDA, tokenAmount);
    
    console.log(`Quote: ${sellQuote.solAmount.toString()} lamports for ${tokenAmount.toString()} tokens`);

    // 6. Sell tokens (automatically handles transfer hooks)
    console.log('🔄 Selling tokens...');
    const sellParams = {
      bondingCurve: bondingCurvePDA,
      tokenAmount: tokenAmount,
      minSolAmount: sellQuote.solAmount.mul(new BN(95)).div(new BN(100)) // 5% slippage
    };

    const sellTx = await hookAmm.sell(sellParams, wallet);
    console.log(`✅ Sell transaction: ${sellTx}`);

    // 7. Manually get transfer hook accounts (for advanced use)
    console.log('🔧 Getting transfer hook accounts manually...');
    const hookAccounts = await hookAmm.getTransferHookAccountsForTrade(
      tokenMint,
      wallet.publicKey, // source
      bondingCurvePDA,  // destination
      wallet.publicKey, // owner
      tokenAmount
    );

    console.log('Transfer hook accounts:');
    hookAccounts.forEach((account, index) => {
      console.log(`  ${index}: ${account.pubkey.toString()} (signer: ${account.isSigner}, writable: ${account.isWritable})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    
    // Handle common transfer hook errors
    if (error.toString().includes('AmountTooBig')) {
      console.log('💡 Tip: Transfer amount exceeds hook validation limit. Try a smaller amount.');
    } else if (error.toString().includes('Account required by instruction is missing')) {
      console.log('💡 Tip: Transfer hook accounts missing. The SDK should handle this automatically.');
    }
  }
}

// Example of using transfer hooks with createBondingCurve
async function createCurveWithHooksExample() {
  const connection = new Connection('https://api.devnet.solana.com');
  const creator = Keypair.generate();
  const hookAmm = new HookAmmClient(connection, { publicKey: creator.publicKey, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs }, HookAmmIdl);

  // Token-2022 mint with transfer hooks
  const tokenMint = new PublicKey('YOUR_TOKEN_2022_MINT_WITH_HOOKS');

  const params = {
    tokenMint: tokenMint,
    initialVirtualTokenReserves: new BN(1_000_000_000_000), // 1M tokens
    initialVirtualSolReserves: new BN(10_000_000_000), // 10 SOL
    initialRealTokenReserves: new BN(0),
    tokenTotalSupply: new BN(1_000_000_000_000) // 1M tokens
  };

  try {
    console.log('🚀 Creating bonding curve for Token-2022 with hooks...');
    const tx = await hookAmm.createBondingCurve(params, creator);
    console.log(`✅ Bonding curve created: ${tx}`);
  } catch (error) {
    console.error('❌ Error creating curve:', error);
  }
}

// Run examples
if (require.main === module) {
  console.log('🪝 HookAMM Transfer Hooks Example\n');
  
  transferHooksExample()
    .then(() => console.log('\n✅ Transfer hooks example completed'))
    .catch(console.error);
}

export { transferHooksExample, createCurveWithHooksExample };