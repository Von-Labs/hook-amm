#!/usr/bin/env ts-node

import { PublicKey } from '@solana/web3.js';
import { 
  createProgram, 
  loadKeypair, 
  getPDAs, 
  ensureSufficientBalance,
  connection,
  SYSTEM_PROGRAM_ID
} from './config';

/**
 * Initialize the global configuration for the HookAMM program
 * This should be run once after deploying the program
 * 
 * Usage: ts-node init.ts [fee_recipient_address]
 * Example: ts-node init.ts 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
 */
async function initializeGlobalConfig() {
  console.log('🚀 Initializing HookAMM Global Configuration...\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const feeRecipientArg = args[0];

  try {
    // Load authority keypair (program deployer)
    const authority = loadKeypair();
    console.log('Authority:', authority.publicKey.toString());

    // Ensure sufficient balance
    await ensureSufficientBalance(authority.publicKey, 1);

    // Create program instance
    const program = createProgram(authority);

    // Set fee recipient from argument or default to authority
    const feeRecipient = feeRecipientArg ? new PublicKey(feeRecipientArg) : authority.publicKey;
    console.log('Fee Recipient:', feeRecipient.toString());

    // Get global config PDA
    const { globalConfig } = getPDAs();
    console.log('Global Config PDA:', globalConfig.toString());

    // Check if already initialized
    try {
      const existingConfig = await (program.account as any).globalConfig.fetch(globalConfig);
      console.log('❌ Global config already initialized!');
      console.log('Current authority:', existingConfig.authority.toString());
      console.log('Current fee recipient:', existingConfig.feeRecipient.toString());
      console.log('Total curves:', existingConfig.totalCurves.toString());
      return;
    } catch (error) {
      // Config doesn't exist yet, proceed with initialization
      console.log('✅ Global config not found, proceeding with initialization...');
    }

    // Initialize global configuration
    console.log('\n📝 Sending initialize transaction...');
    const txSignature = await program.methods
      .initializeGlobalConfig()
      .accounts({
        globalConfig,
        authority: authority.publicKey,
        feeRecipient,
        systemProgram: SYSTEM_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    console.log('✅ Transaction successful!');
    console.log('Transaction signature:', txSignature);
    console.log('Explorer:', `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);

    // Verify initialization
    console.log('\n🔍 Verifying initialization...');
    const config = await (program.account as any).globalConfig.fetch(globalConfig);
    
    console.log('Global Configuration:');
    console.log('├── Authority:', config.authority.toString());
    console.log('├── Fee Recipient:', config.feeRecipient.toString());
    console.log('└── Total Curves:', config.totalCurves.toString());

    console.log('\n🎉 Global configuration initialized successfully!');
    console.log('You can now create bonding curves using create_bonding_curve.ts');

  } catch (error) {
    console.error('❌ Error initializing global config:', error);
    
    if (error.message?.includes('already in use')) {
      console.log('💡 The global config might already be initialized.');
    } else if (error.message?.includes('insufficient funds')) {
      console.log('💡 Make sure your wallet has enough SOL for transaction fees.');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeGlobalConfig();
}