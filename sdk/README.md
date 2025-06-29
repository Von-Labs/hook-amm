# Hook AMM SDK

TypeScript SDK for interacting with the Hook AMM program - a Solana AMM with **automatic Token-2022 transfer hook support**.

## 🚀 Features

- 🔄 **Constant Product AMM**: Automated market making with bonding curves
- 🪝 **Automatic Transfer Hooks**: Zero-config Token-2022 transfer hook handling
- ⚡ **Smart Detection**: Automatically detects and handles different token types
- 📊 **Price Quotes**: Get accurate price quotes before trading
- 🧮 **Math Utilities**: Built-in calculations for reserves, prices, and slippage
- 🔐 **Type Safety**: Full TypeScript support with comprehensive types
- 🛡️ **Error Handling**: Comprehensive error handling for hook-related issues
- 💻 **Multi-Platform**: Works with wallet adapters (browser) and keypairs (Node.js)

## ✨ What's New in v0.4.0

- 🔧 **Consolidated Architecture**: Single unified client (removed V2/V3 versions)
- 📝 **Updated Parameters**: `CreateBondingCurveParams` now matches program structure
- 🎯 **Program Alignment**: Math utilities perfectly aligned with on-chain calculations
- 🧹 **Cleaner API**: Simplified exports and reduced complexity
- ⚡ **Performance**: Optimized for better performance and smaller bundle size

## Installation

```bash
npm install hook-amm-sdk
```

## Quick Start

### Option 1: With Wallet Adapters (Recommended for dApps)

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { HookAmmClient } from 'hook-amm-sdk';
import { useWallet } from '@solana/wallet-adapter-react';
import BN from 'bn.js';

// In a React component
function TradingComponent() {
  const { wallet, publicKey, signTransaction } = useWallet();
  const connection = new Connection('https://api.devnet.solana.com');

  // Create wallet adapter
  const walletAdapter = {
    publicKey,
    signTransaction,
    signAllTransactions: wallet?.adapter?.signAllTransactions,
    sendTransaction: wallet?.adapter?.sendTransaction
  };

  // Load your program IDL
  const programIdl = { /* your program IDL */ };

  // Create client with wallet adapter
  const client = HookAmmClient.create(connection, walletAdapter, programIdl);
}
```

### Option 2: With Keypairs (For testing/backends)

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { HookAmmClient } from 'hook-amm-sdk';
import BN from 'bn.js';

// Initialize connection and keypair
const connection = new Connection('https://api.devnet.solana.com');
const keypair = Keypair.generate();

// Load your program IDL
const programIdl = { /* your program IDL */ };

// Create client with keypair
const client = HookAmmClient.create(connection, keypair, programIdl);
```

### Basic Trading Example

```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { HookAmmClient } from 'hook-amm-sdk';
import BN from 'bn.js';

// Initialize connection and wallet
const connection = new Connection('https://api.devnet.solana.com');
const wallet = new Wallet(Keypair.generate());

// Load your program IDL
const programIdl = { /* your program IDL */ };

// Create client
const client = new HookAmmClient(connection, wallet, programIdl);

// 🪝 Check if token has transfer hooks (automatic detection!)
const hasHooks = await client.isTokenWithHooks(tokenMint);
console.log(`Token has transfer hooks: ${hasHooks}`);

// Get a price quote
const quote = await client.getBuyQuote(
  bondingCurvePubkey,
  new BN(1000000000) // 1 SOL
);

console.log(`Price: ${quote.pricePerToken} SOL per token`);
console.log(`You'll receive: ${quote.tokenAmount.toString()} tokens`);
console.log(`Fee: ${quote.fee.toString()} lamports`);
console.log(`Price impact: ${quote.priceImpact}%`);

// 🚀 Buy tokens (automatically handles transfer hooks!)
const buyParams = {
  bondingCurve: bondingCurvePubkey,
  solAmount: new BN(1000000000),
  minTokenAmount: quote.tokenAmount.mul(new BN(95)).div(new BN(100)) // 5% slippage
};

// With wallet adapters (will prompt user for approval)
const signature = await client.buy(buyParams);

// With keypairs (for testing/backends)
// const signature = await client.buy(buyParams, userKeypair);

// ✅ Transfer hooks handled automatically - no additional configuration needed!
```

## API Reference

### HookAmmClient

Main client class for interacting with the Hook AMM program.

#### Constructors

```typescript
// Original constructor (backwards compatible)
new HookAmmClient(connection: Connection, wallet: Wallet, programIdl: Idl)

// Factory method with wallet adapter support
HookAmmClient.create(connection: Connection, signer: WalletAdapter | Keypair, programIdl: Idl)
```

#### Wallet Support

The SDK supports multiple wallet types:

```typescript
// Wallet adapters (Phantom, Solflare, etc.)
interface WalletAdapter {
  publicKey: PublicKey | null;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
  signAllTransactions?(transactions: Transaction[]): Promise<Transaction[]>;
  sendTransaction?(transaction: Transaction, connection: Connection, options?: any): Promise<string>;
}

// Keypairs (for testing/backends)
const keypair = Keypair.generate();

// Both work with the same API
const client = HookAmmClient.create(connection, walletAdapter, programIdl);
const client2 = HookAmmClient.create(connection, keypair, programIdl);
```

#### Methods

##### Trading Operations

```typescript
// Buy tokens with SOL (automatically handles transfer hooks)
async buy(
  params: BuyParams, 
  signer?: WalletAdapter | Keypair, // Optional - uses client's default signer
  additionalHookAccounts?: HookAccount[],
  options?: SendTransactionOptions
): Promise<string>

// Sell tokens for SOL (automatically handles transfer hooks)
async sell(
  params: SellParams, 
  signer?: WalletAdapter | Keypair, // Optional - uses client's default signer
  additionalHookAccounts?: HookAccount[],
  options?: SendTransactionOptions
): Promise<string>

// Get buy quote
async getBuyQuote(bondingCurve: PublicKey, solAmount: BN): Promise<PriceQuote>

// Get sell quote
async getSellQuote(bondingCurve: PublicKey, tokenAmount: BN): Promise<PriceQuote>
```

##### Curve Management

```typescript
// Create new bonding curve
async createBondingCurve(
  params: CreateBondingCurveParams, 
  signer?: WalletAdapter | Keypair, // Optional - uses client's default signer
  options?: SendTransactionOptions
): Promise<string>

// Get bonding curve data
async getBondingCurve(bondingCurve: PublicKey): Promise<BondingCurve>

// Get all bonding curves
async getAllBondingCurves(): Promise<{publicKey: PublicKey, account: BondingCurve}[]>

// Get curves by creator
async getBondingCurvesByCreator(creator: PublicKey): Promise<{publicKey: PublicKey, account: BondingCurve}[]>
```

##### Configuration

```typescript
// Initialize global config (admin only)
async initializeGlobalConfig(
  authority: PublicKey, 
  feeRecipient: PublicKey, 
  signer?: WalletAdapter | Keypair, // Optional - uses client's default signer
  options?: SendTransactionOptions
): Promise<string>

// Get global configuration
async getGlobalConfig(): Promise<GlobalConfig>
```

##### Token-2022 Hook Support

```typescript
// Check if token has transfer hooks
async isTokenWithHooks(mintAddress: PublicKey): Promise<boolean>

// Get transfer hook accounts with full metadata
async getTransferHookAccountsForTrade(
  mintAddress: PublicKey,
  source: PublicKey, 
  destination: PublicKey,
  owner: PublicKey,
  amount: BN
): Promise<HookAccount[]>

// Type for hook accounts
interface HookAccount {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}
```

### Types

#### Core Types

```typescript
interface BondingCurve {
  mint: PublicKey;
  creator: PublicKey;
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
  realTokenReserves: BN;
  realSolReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
  index: BN;
}

interface PriceQuote {
  tokenAmount: BN;
  solAmount: BN;
  fee: BN;
  pricePerToken: number;
  priceImpact: number;
}
```

#### Parameter Types

```typescript
interface BuyParams {
  bondingCurve: PublicKey;
  solAmount: BN;
  minTokenAmount: BN;
}

interface SellParams {
  bondingCurve: PublicKey;
  tokenAmount: BN;
  minSolAmount: BN;
}

// Updated in v0.4.0 to match program structure
interface CreateBondingCurveParams {
  tokenMint: PublicKey;
  initialSupply: BN;           // Changed from tokenTotalSupply
  virtualTokenReserves: BN;    // Changed from initialVirtualTokenReserves
  virtualSolReserves: BN;      // Changed from initialVirtualSolReserves
}
```

### Utilities

#### PDA Functions

```typescript
import { getGlobalConfigPDA, getBondingCurvePDA, getCurveTokenAccountPDA } from 'hook-amm-sdk';

const [globalConfig, bump] = getGlobalConfigPDA();
const [bondingCurve, bump] = getBondingCurvePDA(tokenMint);
const [curveTokenAccount, bump] = getCurveTokenAccountPDA(bondingCurve, tokenMint);
```

#### Math Functions

```typescript
import { calculateBuyAmount, calculateSellAmount, calculateTokenPrice } from 'hook-amm-sdk';

// Calculate buy amounts (matches program's exact formula)
const { tokenAmount, fee } = calculateBuyAmount(
  solAmountAfterFee,
  currentSolReserves,
  currentTokenReserves,
  realSolReserves,
  realTokenReserves
);

// Calculate sell amounts (matches program's exact formula)
const { solAmount, fee } = calculateSellAmount(
  tokenAmountIn,
  currentTokenReserves,
  currentSolReserves,
  realTokenReserves,
  realSolReserves
);

// Get current token price
const priceInSol = calculateTokenPrice(
  virtualSolReserves,
  virtualTokenReserves,
  realSolReserves,
  realTokenReserves
);
```

#### Token Utilities

```typescript
import { getTokenProgramId, getMintInfo, isToken2022, hasTransferHooks } from 'hook-amm-sdk';

// Detect token program
const tokenProgramId = await getTokenProgramId(connection, mintAddress);

// Get mint information
const mintInfo = await getMintInfo(connection, mintAddress);

// Check if Token-2022
const isT22 = isToken2022(mintAccountInfo);

// Check if token has transfer hooks
const hasHooks = await hasTransferHooks(connection, mintAddress);
```

## 🪝 Token-2022 Transfer Hook Support

**The SDK automatically handles Token-2022 transfer hooks** - no configuration required!

### Automatic Mode (Recommended)

```typescript
// ✅ Zero configuration - SDK automatically handles everything
await client.buy(buyParams, userKeypair);
await client.sell(sellParams, userKeypair);

// The SDK automatically:
// 1. Detects if token has transfer hooks
// 2. Resolves hook program accounts
// 3. Includes required accounts in transaction
// 4. Handles hook-specific PDAs and meta accounts
```

### Manual Mode (Advanced)

```typescript
// 🔧 Manual control for advanced use cases
const hookAccounts = await client.getTransferHookAccountsForTrade(
  tokenMint,
  sourceAccount,
  destinationAccount,
  owner,
  amount
);

// Add additional custom hook accounts if needed
const customAccounts = [
  { pubkey: customPDA, isSigner: false, isWritable: true }
];

await client.buy(buyParams, userKeypair, [...hookAccounts, ...customAccounts]);
```

### Hook Detection

```typescript
// Check if token supports transfer hooks
const hasHooks = await client.isTokenWithHooks(tokenMint);
if (hasHooks) {
  console.log('🪝 This token uses transfer hooks - handled automatically!');
} else {
  console.log('📄 Standard token - no hooks needed');
}
```

## Examples

### Wallet Adapter Integration

```typescript
// React component with wallet adapter
import { useWallet } from '@solana/wallet-adapter-react';
import { HookAmmClient } from 'hook-amm-sdk';

function TradingComponent() {
  const { wallet, publicKey, signTransaction, sendTransaction } = useWallet();
  const connection = new Connection('https://api.devnet.solana.com');

  const handleTrade = async () => {
    if (!wallet || !publicKey) {
      throw new Error('Wallet not connected');
    }

    // Create wallet adapter
    const walletAdapter = {
      publicKey,
      signTransaction,
      signAllTransactions: wallet.adapter.signAllTransactions,
      sendTransaction
    };

    // Create client
    const client = HookAmmClient.create(connection, walletAdapter, programIdl);

    // Trade - wallet will prompt user for approval
    const buyParams = {
      bondingCurve: bondingCurvePubkey,
      solAmount: new BN(1000000000),
      minTokenAmount: new BN(0)
    };

    const signature = await client.buy(buyParams);
    console.log('Trade successful:', signature);
  };

  return (
    <button onClick={handleTrade} disabled={!publicKey}>
      {publicKey ? 'Buy Tokens' : 'Connect Wallet'}
    </button>
  );
}
```

### Mixed Signer Usage

```typescript
// Different signers for different operations
const connection = new Connection('https://api.devnet.solana.com');
const adminKeypair = Keypair.generate();
const client = HookAmmClient.create(connection, adminKeypair, programIdl);

// Admin operations use admin keypair (default)
await client.initializeGlobalConfig(
  adminKeypair.publicKey,
  feeRecipient
);

// User operations can use different signers
const userWallet = getConnectedWallet(); // From wallet adapter
await client.buy(buyParams, userWallet); // Specify different signer

// Or with keypair for testing
const testKeypair = Keypair.generate();
await client.buy(buyParams, testKeypair);
```

### Creating a Bonding Curve

```typescript
import { Keypair } from '@solana/web3.js';
import BN from 'bn.js';

const tokenMint = new PublicKey('...');

// Updated parameters structure in v0.4.0
const params = {
  tokenMint,
  initialSupply: new BN('1000000000000'),        // Total supply to deposit
  virtualTokenReserves: new BN('1000000000000'), // Virtual token reserves
  virtualSolReserves: new BN('30000000000'),     // Virtual SOL reserves (30 SOL)
};

// With wallet adapter (prompts user)
const signature = await client.createBondingCurve(params);

// With specific keypair
const creatorKeypair = Keypair.generate();
const signature2 = await client.createBondingCurve(params, creatorKeypair);
```

### Trading with Price Quotes

```typescript
// Get a quote first
const buyQuote = await client.getBuyQuote(
  bondingCurvePubkey,
  new BN('1000000000') // 1 SOL
);

// Check slippage tolerance
if (buyQuote.priceImpact > 5) { // 5% max slippage
  throw new Error('Price impact too high');
}

// Execute the trade
const buyParams = {
  bondingCurve: bondingCurvePubkey,
  solAmount: new BN('1000000000'),
  minTokenAmount: buyQuote.tokenAmount.mul(new BN(95)).div(new BN(100)) // 5% slippage
};

// With wallet adapter (default)
const signature = await client.buy(buyParams);

// With specific keypair (for testing/backends)
const userKeypair = Keypair.generate();
const signature2 = await client.buy(buyParams, userKeypair);
```

## Error Handling

```typescript
try {
  await client.buy(buyParams);
} catch (error) {
  if (error.message.includes('SlippageTooHigh')) {
    console.error('Trade failed due to slippage');
  } else if (error.message.includes('InsufficientFunds')) {
    console.error('Insufficient balance');
  } else if (error.message.includes('User rejected')) {
    console.error('User cancelled the transaction');
  } else if (error.message.includes('does not support signing')) {
    console.error('Wallet cannot sign transactions');
  } else {
    console.error('Trade failed:', error);
  }
}
```

## Migration Guide

### From v0.3.0 to v0.4.0

1. **Remove V2/V3 imports**: Use only `HookAmmClient` now
   ```typescript
   // Before
   import { HookAmmClientV2 } from 'hook-amm-sdk';
   
   // After
   import { HookAmmClient } from 'hook-amm-sdk';
   ```

2. **Update CreateBondingCurveParams**: Parameter names have changed
   ```typescript
   // Before
   const params = {
     tokenMint,
     initialVirtualTokenReserves: new BN('1000000000000'),
     initialVirtualSolReserves: new BN('30000000000'),
     initialRealTokenReserves: new BN('0'),
     tokenTotalSupply: new BN('1000000000000'),
   };
   
   // After
   const params = {
     tokenMint,
     initialSupply: new BN('1000000000000'),        // Renamed from tokenTotalSupply
     virtualTokenReserves: new BN('1000000000000'), // Renamed from initialVirtualTokenReserves
     virtualSolReserves: new BN('30000000000'),     // Renamed from initialVirtualSolReserves
   };
   ```

3. **Factory method**: Use `.create()` for wallet adapter support
   ```typescript
   // Before
   const client = new HookAmmClientV2(connection, wallet, programIdl);
   
   // After
   const client = HookAmmClient.create(connection, walletOrKeypair, programIdl);
   // Or continue using: new HookAmmClient(connection, wallet, programIdl);
   ```

## Constants

```typescript
import { PROGRAM_ID, FEE_BASIS_POINTS, FEE_DENOMINATOR } from 'hook-amm-sdk';

console.log('Program ID:', PROGRAM_ID.toBase58());
console.log('Fee:', FEE_BASIS_POINTS / FEE_DENOMINATOR * 100, '%'); // 1%
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm run test

# Lint
npm run lint
```

## License

MIT