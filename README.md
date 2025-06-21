# HookAMM - Solana AMM with Bonding Curves and Token-2022 Support

A decentralized Automated Market Maker (AMM) on Solana featuring customizable bonding curves and full Token-2022 transfer hook support.

## Features

- 🎯 **Customizable Bonding Curves**: Set your own virtual reserves for custom price curves
- 🪝 **Token-2022 Transfer Hooks**: Full support for tokens with transfer hooks
- 💰 **Low Fees**: 1% trading fee on all transactions
- 🔒 **Secure**: Fixed SOL transfer issue with proper fee handling
- 📊 **Price Discovery**: Virtual reserves provide initial liquidity and price stability
- 🚀 **High Performance**: Optimized for gas efficiency

## Program Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PROGRAM STRUCTURE                        │
└─────────────────────────────────────────────────────────────────┘

programs/hook-amm/
├── src/
│   ├── lib.rs                 # Main program entry point
│   ├── constants.rs           # Program constants
│   ├── errors.rs              # Custom error types
│   ├── events.rs              # Event definitions
│   ├── instructions/          # Instruction handlers
│   │   ├── initialize_global_config.rs
│   │   ├── create_bonding_curve.rs
│   │   ├── buy.rs
│   │   └── sell.rs
│   ├── state/                 # Account structures
│   │   ├── global_config.rs   # Global configuration
│   │   └── bonding_curve.rs   # Bonding curve state
│   └── utils.rs               # Utility functions
```

## Program Flow

### 1. Initialization Phase

```
Admin → initialize_global_config()
            │
            ▼
    ┌─────────────────┐
    │  GlobalConfig   │
    │  - authority    │
    │  - fee_recipient│
    │  - total_curves │
    └─────────────────┘
```

### 2. Bonding Curve Creation

```
Creator → create_bonding_curve(params)
                │
                ▼
    ┌─────────────────────────┐
    │     BondingCurve        │
    │  - custom virtual reserves
    │  - initial supply       │
    │  - mint reference       │
    └─────────────────────────┘
                │
                ▼
    ┌─────────────────────────┐
    │  Curve Token Account    │
    │  (Holds tokens for AMM) │
    └─────────────────────────┘
```

### 3. Trading Flow

#### Buy Flow (SOL → Tokens)
```
User wants to buy tokens with 1 SOL
                │
                ▼
Calculate: fee = 1 SOL × 1% = 0.01 SOL
          amount_after_fee = 0.99 SOL
                │
                ▼
┌─────────────────────────────────────┐
│         SOL TRANSFERS               │
│  User → Bonding Curve: 0.99 SOL    │
│  User → Fee Recipient: 0.01 SOL    │
└─────────────────────────────────────┘
                │
                ▼
Calculate tokens using bonding curve:
tokens_out = f(amount_after_fee, reserves)
                │
                ▼
┌─────────────────────────────────────┐
│        TOKEN TRANSFER               │
│  Curve → User: tokens_out          │
│  (With Token-2022 hook support)    │
└─────────────────────────────────────┘
                │
                ▼
Update bonding curve reserves
```

#### Sell Flow (Tokens → SOL)
```
User wants to sell tokens
                │
                ▼
Transfer tokens: User → Curve
                │
                ▼
Calculate SOL output using bonding curve:
sol_out = f(token_amount, reserves)
                │
                ▼
Calculate: fee = sol_out × 1%
          amount_after_fee = sol_out - fee
                │
                ▼
┌─────────────────────────────────────┐
│         SOL TRANSFERS               │
│  Curve → User: amount_after_fee    │
│  Curve → Fee Recipient: fee        │
└─────────────────────────────────────┘
                │
                ▼
Update bonding curve reserves
```

## Bonding Curve Mathematics

The AMM uses a constant product formula with virtual reserves:

```
Constant Product: (Virtual SOL + Real SOL) × (Virtual Tokens - Real Tokens) = k

Price Calculation:
- Current Price = Total SOL Reserves / Total Token Reserves
- Buy Amount = Current Token Reserves - (k / New SOL Reserves)
- Sell Amount = Current SOL Reserves - (k / New Token Reserves)
```

## Getting Started

### Prerequisites

- Rust 1.70+
- Solana CLI 1.17+
- Anchor 0.31+
- Node.js 16+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/hook-amm
cd hook-amm

# Install dependencies
yarn install

# Build the program
anchor build

# Run tests
anchor test
```

### Deploy to Devnet

```bash
# Configure for devnet
solana config set --url devnet

# Deploy the program
anchor deploy

# Initialize the program (one-time setup)
anchor run initialize
```

## Usage Examples

### Create a Bonding Curve

```typescript
const params = {
  initialSupply: new BN(1_000_000_000_000), // 1M tokens
  virtualTokenReserves: new BN(500_000_000_000_000), // 500M
  virtualSolReserves: new BN(10_000_000_000), // 10 SOL
};

await program.methods
  .createBondingCurve(params)
  .accounts({
    bondingCurve,
    curveTokenAccount,
    mint,
    creator: wallet.publicKey,
    globalConfig,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    rent: SYSVAR_RENT_PUBKEY,
  })
  .rpc();
```

### Buy Tokens

```typescript
await program.methods
  .buy(
    new BN(1_000_000_000), // 1 SOL
    new BN(950_000) // Min tokens (slippage protection)
  )
  .accounts({
    bondingCurve,
    curveTokenAccount,
    userTokenAccount,
    user: wallet.publicKey,
    mint,
    globalConfig,
    feeRecipient,
    tokenProgram: TOKEN_PROGRAM_ID,
    // ... other accounts
  })
  .rpc();
```

### Token-2022 with Transfer Hooks

```typescript
// For tokens with transfer hooks, pass additional accounts
await program.methods
  .buy(solAmount, minTokenAmount)
  .accounts({ /* ... standard accounts ... */ })
  .remainingAccounts([
    // Hook program accounts
    { pubkey: hookProgram, isSigner: false, isWritable: false },
    { pubkey: hookAccount1, isSigner: false, isWritable: true },
    // ... additional hook accounts
  ])
  .rpc();
```

## SDK Usage

We provide a TypeScript SDK for easier integration:

```bash
# Install the SDK
npm install @hook-amm/sdk
```

```typescript
import { HookAmm } from '@hook-amm/sdk';

// Initialize SDK
const hookAmm = new HookAmm(connection);

// Create bonding curve
await hookAmm.createBondingCurve(creator, mint, {
  initialSupply: new BN(1_000_000_000_000),
  virtualTokenReserves: new BN(500_000_000_000_000),
  virtualSolReserves: new BN(10_000_000_000),
});

// Buy tokens
await hookAmm.buy(buyer, mint, {
  solAmount: new BN(1_000_000_000),
  minTokenAmount: new BN(950_000),
});

// Get current price
const price = await hookAmm.getPrice(mint);
console.log('Price per token:', price.pricePerToken, 'SOL');
```

## Security Considerations

1. **Slippage Protection**: Always set `minTokenAmount` for buys and `minSolAmount` for sells
2. **Parameter Validation**: Virtual reserves must be > 0 to prevent division by zero
3. **Fee Handling**: Fees are transferred directly from users to prevent PDA transfer issues
4. **Overflow Protection**: All calculations use checked math operations

## Fee Structure

- **Trading Fee**: 1% on all buys and sells
- **Fee Recipient**: Set during global config initialization
- **Fee Distribution**: Automatically transferred on each trade

## Testing

```bash
# Run all tests
anchor test

# Run specific test
anchor test -- --grep "buy transaction"

# Run with logging
RUST_LOG=debug anchor test
```

## Customization Options

### Virtual Reserves
Virtual reserves determine the initial price curve:
- Higher virtual SOL = Higher initial price
- Higher virtual tokens = Lower initial price
- Ratio determines steepness of price curve

### Example Configurations

**Stable Launch** (High liquidity, low volatility):
```typescript
{
  virtualTokenReserves: new BN(1_000_000_000_000_000), // 1B tokens
  virtualSolReserves: new BN(100_000_000_000), // 100 SOL
}
```

**Aggressive Launch** (Low liquidity, high volatility):
```typescript
{
  virtualTokenReserves: new BN(100_000_000_000_000), // 100M tokens
  virtualSolReserves: new BN(10_000_000_000), // 10 SOL
}
```

## Troubleshooting

### Common Issues

1. **"InvalidAmount" Error**: Ensure all amounts are > 0
2. **"SlippageExceeded" Error**: Increase slippage tolerance
3. **"Overflow" Error**: Virtual reserves might be too large
4. **Token Account Not Found**: Create ATA before trading

### Debug Mode

Enable debug logging:
```bash
export RUST_LOG=hook_amm=debug
anchor test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Anchor Framework](https://anchor-lang.com/)
- Supports [Token-2022 Program](https://spl.solana.com/token-2022)
- Inspired by pump.fun and other bonding curve implementations