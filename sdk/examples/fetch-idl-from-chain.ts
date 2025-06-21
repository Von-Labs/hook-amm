import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { HookAmm } from '../src';

const PROGRAM_ID = new PublicKey('9rftcX9CMpRaZJUteZ5yyY5bxy2LKSGRfp3xq9uP1SaC');

/**
 * Example of fetching IDL from the blockchain
 * Note: The program must have been deployed with `anchor idl init` for this to work
 */
async function fetchIdlFromChain() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  try {
    // Create a provider
    const provider = new AnchorProvider(
      connection,
      {} as any,
      { commitment: 'confirmed' }
    );
    
    // Fetch IDL from chain
    const idl = await Program.fetchIdl(PROGRAM_ID, provider);
    
    if (!idl) {
      throw new Error('IDL not found on chain. Make sure the program was deployed with anchor idl init');
    }
    
    // Initialize SDK with fetched IDL
    const hookAmm = new HookAmm(connection, PROGRAM_ID, idl);
    
    console.log('Successfully initialized HookAmm with IDL from chain');
    
    // Now you can use the SDK
    const globalConfig = await hookAmm.getGlobalConfig();
    console.log('Global config:', globalConfig);
    
  } catch (error) {
    console.error('Error fetching IDL from chain:', error);
    console.log('\nFalling back to embedded IDL...');
    
    // Fallback to embedded IDL
    const hookAmm = new HookAmm(connection, PROGRAM_ID);
    console.log('Successfully initialized HookAmm with embedded IDL');
  }
}

/**
 * Example of loading IDL from a file
 */
async function loadIdlFromFile() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // In a real application, you might load this from a file
  // const idl = JSON.parse(fs.readFileSync('./hook_amm.json', 'utf8'));
  
  // For this example, we'll use the embedded IDL
  const { IDL } = await import('../src/idl');
  
  // Initialize SDK with loaded IDL
  const hookAmm = new HookAmm(connection, PROGRAM_ID, IDL);
  
  console.log('Successfully initialized HookAmm with loaded IDL');
}

// Run examples
async function main() {
  console.log('Example 1: Fetching IDL from chain');
  await fetchIdlFromChain();
  
  console.log('\n\nExample 2: Loading IDL from file');
  await loadIdlFromFile();
}

main().catch(console.error);