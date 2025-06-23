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

## ✨ What's New in v0.2.0

- 🪝 **Automatic Transfer Hook Handling**: No more manual hook account management!
- 🔍 **Hook Detection**: `isTokenWithHooks()` to check token capabilities
- 🔧 **Better Account Resolution**: Automatic PDA resolution for hook accounts
- 📖 **Complete Examples**: Full transfer hook integration examples

## Installation

```bash
npm install @hook-amm/sdk
```

## Quick Start

```typescript
import { Connection, Keypair } from '@solana/web3.js';
import { Wallet } from '@coral-xyz/anchor';
import { HookAmmClient } from '@hook-amm/sdk';
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

const signature = await client.buy(buyParams, userKeypair);
// ✅ Transfer hooks handled automatically - no additional configuration needed!
```

## API Reference

### HookAmmClient

Main client class for interacting with the Hook AMM program.

#### Constructor

```typescript
new HookAmmClient(connection: Connection, wallet: Wallet, programIdl: Idl)
```

#### Methods

##### Trading Operations

```typescript
// Buy tokens with SOL (automatically handles transfer hooks)
async buy(params: BuyParams, userKeypair: Keypair, additionalHookAccounts?: HookAccount[]): Promise<string>

// Sell tokens for SOL (automatically handles transfer hooks)
async sell(params: SellParams, userKeypair: Keypair, additionalHookAccounts?: HookAccount[]): Promise<string>

// Get buy quote
async getBuyQuote(bondingCurve: PublicKey, solAmount: BN): Promise<PriceQuote>

// Get sell quote
async getSellQuote(bondingCurve: PublicKey, tokenAmount: BN): Promise<PriceQuote>
```

##### Curve Management

```typescript
// Create new bonding curve
async createBondingCurve(params: CreateBondingCurveParams, creatorKeypair: Keypair): Promise<string>

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
async initializeGlobalConfig(authority: PublicKey, feeRecipient: PublicKey, authorityKeypair: Keypair): Promise<string>

// Get global configuration
async getGlobalConfig(): Promise<GlobalConfig>
```

##### Token-2022 Hook Support (New in v0.2.0!)

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

interface CreateBondingCurveParams {
  tokenMint: PublicKey;
  initialVirtualTokenReserves: BN;
  initialVirtualSolReserves: BN;
  initialRealTokenReserves: BN;
  tokenTotalSupply: BN;
}
```

### Utilities

#### PDA Functions

```typescript
import { getGlobalConfigPDA, getBondingCurvePDA, getCurveTokenAccountPDA } from '@hook-amm/sdk';

const [globalConfig, bump] = getGlobalConfigPDA();
const [bondingCurve, bump] = getBondingCurvePDA(tokenMint);
const [curveTokenAccount, bump] = getCurveTokenAccountPDA(bondingCurve, tokenMint);
```

#### Math Functions

```typescript
import { calculateBuyAmount, calculateSellAmount, calculateTokenPrice } from '@hook-amm/sdk';

// Calculate buy amounts
const { tokenAmount, fee } = calculateBuyAmount(
  solAmountIn,
  virtualSolReserves,
  virtualTokenReserves,
  realSolReserves,
  realTokenReserves
);

// Calculate sell amounts  
const { solAmount, fee } = calculateSellAmount(
  tokenAmountIn,
  virtualSolReserves,
  virtualTokenReserves,
  realSolReserves,
  realTokenReserves
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
import { getTokenProgramId, getMintInfo, isToken2022, hasTransferHooks } from '@hook-amm/sdk';

// Detect token program
const tokenProgramId = await getTokenProgramId(connection, mintAddress);

// Get mint information
const mintInfo = await getMintInfo(connection, mintAddress);

// Check if Token-2022
const isT22 = isToken2022(mintAccountInfo);

// Check if token has transfer hooks (new in v0.2.0!)
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

### Creating a Bonding Curve

```typescript
import { Keypair } from '@solana/web3.js';
import BN from 'bn.js';

const creatorKeypair = Keypair.generate();
const tokenMint = new PublicKey('...');

const params = {
  tokenMint,
  initialVirtualTokenReserves: new BN('1000000000000'), // 1M tokens
  initialVirtualSolReserves: new BN('30000000000'),     // 30 SOL
  initialRealTokenReserves: new BN('0'),                // Start with 0
  tokenTotalSupply: new BN('1000000000000'),            // 1M total supply
};

const signature = await client.createBondingCurve(params, creatorKeypair);
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

const signature = await client.buy(buyParams, userKeypair);
```

## Error Handling

```typescript
try {
  await client.buy(buyParams, userKeypair);
} catch (error) {
  if (error.message.includes('SlippageTooHigh')) {
    console.error('Trade failed due to slippage');
  } else if (error.message.includes('InsufficientFunds')) {
    console.error('Insufficient balance');
  } else {
    console.error('Trade failed:', error);
  }
}
```

## Constants

```typescript
import { PROGRAM_ID, FEE_BASIS_POINTS, FEE_DENOMINATOR } from '@hook-amm/sdk';

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