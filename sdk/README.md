# HookAMM SDK

TypeScript SDK for interacting with the HookAMM program on Solana.

## Installation

```bash
npm install @hook-amm/sdk
# or
yarn add @hook-amm/sdk
```

## Quick Start

```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { HookAmm } from '@hook-amm/sdk';
import BN from 'bn.js';

// Initialize the SDK (IDL is embedded by default)
const connection = new Connection('https://api.devnet.solana.com');
const hookAmm = new HookAmm(connection);

// Create a bonding curve
const creator = Keypair.generate();
const mint = new PublicKey('...');

await hookAmm.createBondingCurve(
  creator,
  mint,
  {
    initialSupply: new BN(1_000_000_000_000), // 1M tokens with 6 decimals
    virtualTokenReserves: new BN(500_000_000_000_000), // 500M tokens
    virtualSolReserves: new BN(10_000_000_000), // 10 SOL
  }
);

// Buy tokens
const buyer = Keypair.generate();
const buyAmount = new BN(1_000_000_000); // 1 SOL

await hookAmm.buy(
  buyer,
  mint,
  {
    solAmount: buyAmount,
    minTokenAmount: new BN(0), // Set appropriate slippage
  }
);

// Get current price
const price = await hookAmm.getPrice(mint);
console.log('Current price:', price?.pricePerToken, 'SOL per token');
```

## API Reference

### Initialize SDK

```typescript
// Option 1: Use embedded IDL (default)
const hookAmm = new HookAmm(connection);

// Option 2: Use custom program ID with embedded IDL
const hookAmm = new HookAmm(connection, customProgramId);

// Option 3: Provide your own IDL
import { IDL } from '@hook-amm/sdk';
const hookAmm = new HookAmm(connection, programId, IDL);

// Option 4: Fetch IDL from chain (if deployed with anchor idl init)
const idl = await Program.fetchIdl(programId, provider);
const hookAmm = new HookAmm(connection, programId, idl);
```

### Global Config

```typescript
// Initialize global configuration (one-time setup)
await hookAmm.initializeGlobalConfig(authority, feeRecipient);

// Get global config
const config = await hookAmm.getGlobalConfig();
```

### Bonding Curves

```typescript
// Create bonding curve with custom parameters
await hookAmm.createBondingCurve(creator, mint, {
  initialSupply: new BN(1_000_000_000_000),
  virtualTokenReserves: new BN(500_000_000_000_000),
  virtualSolReserves: new BN(10_000_000_000),
});

// Get bonding curve data
const curve = await hookAmm.getBondingCurve(mint);

// Get all bonding curves
const allCurves = await hookAmm.getAllBondingCurves();

// Get curves by creator
const creatorCurves = await hookAmm.getBondingCurvesByCreator(creator);
```

### Trading

```typescript
// Buy tokens
await hookAmm.buy(buyer, mint, {
  solAmount: new BN(1_000_000_000), // 1 SOL
  minTokenAmount: new BN(900_000), // Min tokens to receive
});

// Sell tokens
await hookAmm.sell(seller, mint, {
  tokenAmount: new BN(1_000_000), // Amount to sell
  minSolAmount: new BN(900_000_000), // Min SOL to receive
});

// Simulate trades before execution
const buySimulation = await hookAmm.simulateBuy(mint, solAmount);
console.log('Expected tokens:', buySimulation.tokenAmount.toString());
console.log('Fee:', buySimulation.fee.toString());
console.log('Price impact:', buySimulation.priceImpact, '%');

const sellSimulation = await hookAmm.simulateSell(mint, tokenAmount);
console.log('Expected SOL:', sellSimulation.solAmount.toString());
```

### Token-2022 Support

```typescript
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

// For Token-2022 tokens with transfer hooks
const remainingAccounts = [
  // Add hook program accounts here
  { pubkey: hookProgramAccount1, isSigner: false, isWritable: true },
  { pubkey: hookProgramAccount2, isSigner: false, isWritable: false },
];

await hookAmm.buy(
  buyer,
  mint,
  buyParams,
  TOKEN_2022_PROGRAM_ID,
  remainingAccounts
);
```

### Price & Market Data

```typescript
// Get current price and market metrics
const priceData = await hookAmm.getPrice(mint);
console.log({
  pricePerToken: priceData.pricePerToken,
  marketCap: priceData.marketCap,
  availableTokens: priceData.availableTokens.toString(),
  availableSol: priceData.availableSol.toString(),
});
```

### Events

```typescript
// Listen to trade events
const listenerId = hookAmm.onTradeEvent((event) => {
  console.log('Trade event:', {
    mint: event.mint.toString(),
    user: event.user.toString(),
    isBuy: event.isBuy,
    solAmount: event.solAmount.toString(),
    tokenAmount: event.tokenAmount.toString(),
  });
});

// Remove listener when done
await hookAmm.removeEventListener(listenerId);
```

### Utility Functions

```typescript
import { 
  calculateBuyAmount,
  calculateSellAmount,
  calculateFee,
  calculateMinimumReceived,
  formatSolAmount,
  parseSolAmount,
  estimatePriceImpact
} from '@hook-amm/sdk';

// Calculate expected outputs
const tokenOutput = calculateBuyAmount(solInput, solReserves, tokenReserves);
const solOutput = calculateSellAmount(tokenInput, tokenReserves, solReserves);

// Calculate fees (1%)
const fee = calculateFee(amount);

// Apply slippage tolerance (in basis points)
const minReceived = calculateMinimumReceived(expectedAmount, 50); // 0.5% slippage

// Format amounts for display
const solDisplay = formatSolAmount(lamports); // "1.5" SOL
const lamports = parseSolAmount("1.5"); // 1500000000 lamports

// Estimate price impact before trading
const impact = estimatePriceImpact(bondingCurve, true, tradeAmount);
```

## Examples

### Create and Trade Full Flow

```typescript
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, mintTo } from '@solana/spl-token';
import { HookAmm } from '@hook-amm/sdk';
import BN from 'bn.js';

async function example() {
  const connection = new Connection('https://api.devnet.solana.com');
  const hookAmm = new HookAmm(connection); // IDL is embedded

  // Setup accounts
  const authority = Keypair.generate();
  const feeRecipient = Keypair.generate();
  const creator = Keypair.generate();
  const buyer = Keypair.generate();

  // Airdrop SOL
  await connection.requestAirdrop(creator.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.requestAirdrop(buyer.publicKey, 10 * LAMPORTS_PER_SOL);

  // Initialize global config (one-time)
  await hookAmm.initializeGlobalConfig(authority, feeRecipient.publicKey);

  // Create mint
  const mint = await createMint(
    connection,
    creator,
    creator.publicKey,
    null,
    6
  );

  // Create bonding curve with custom parameters
  await hookAmm.createBondingCurve(creator, mint, {
    initialSupply: new BN(1_000_000_000_000), // 1M tokens
    virtualTokenReserves: new BN(500_000_000_000_000), // 500M virtual tokens
    virtualSolReserves: new BN(10_000_000_000), // 10 virtual SOL
  });

  // Get curve token account and mint initial supply
  const { curveTokenAccount } = getPDAs(PROGRAM_ID, mint);
  await mintTo(
    connection,
    creator,
    mint,
    curveTokenAccount,
    creator,
    1_000_000_000_000
  );

  // Check price before trade
  const priceBefore = await hookAmm.getPrice(mint);
  console.log('Price before:', priceBefore?.pricePerToken);

  // Simulate buy
  const simulation = await hookAmm.simulateBuy(mint, new BN(LAMPORTS_PER_SOL));
  console.log('Simulation:', {
    tokens: simulation.tokenAmount.toString(),
    impact: simulation.priceImpact + '%'
  });

  // Execute buy
  await hookAmm.buy(buyer, mint, {
    solAmount: new BN(LAMPORTS_PER_SOL),
    minTokenAmount: simulation.tokenAmount.muln(99).divn(100), // 1% slippage
  });

  // Check price after trade
  const priceAfter = await hookAmm.getPrice(mint);
  console.log('Price after:', priceAfter?.pricePerToken);
}
```

### Monitor Bonding Curves

```typescript
// Listen to all trade events
const listenerId = hookAmm.onTradeEvent((event) => {
  if (event.isBuy) {
    console.log(`BUY: ${event.user} bought ${event.tokenAmount} tokens for ${event.solAmount} SOL`);
  } else {
    console.log(`SELL: ${event.user} sold ${event.tokenAmount} tokens for ${event.solAmount} SOL`);
  }
});

// Get all active curves
const curves = await hookAmm.getAllBondingCurves();
for (const { publicKey, account } of curves) {
  if (!account.complete) {
    const price = calculatePrice(account);
    console.log(`Curve ${publicKey}: ${price.pricePerToken} SOL/token`);
  }
}
```

## Error Handling

```typescript
import { HookAmmSDKError, HookAmmError } from '@hook-amm/sdk';

try {
  await hookAmm.buy(buyer, mint, params);
} catch (error) {
  if (error instanceof HookAmmSDKError) {
    console.error('SDK Error:', error.message);
    
    if (error.code === HookAmmError.SlippageExceeded) {
      console.log('Try increasing slippage tolerance');
    } else if (error.code === HookAmmError.InsufficientReserves) {
      console.log('Not enough liquidity for this trade');
    }
  }
}
```

## License

MIT