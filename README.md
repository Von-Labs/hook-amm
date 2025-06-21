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
│   └── utils.rs               # Utility functions (including transfer hooks)
```

## Transfer Hook Integration

HookAMM provides seamless support for Token-2022 transfer hooks, enabling tokens with custom transfer logic to be traded on the AMM.

### What are Transfer Hooks?

Transfer hooks are a Token-2022 feature that allows custom programs to be executed during token transfers. This enables:

- **Custom Transfer Logic**: Implement restrictions, fees, or special behaviors
- **Real-time Processing**: Execute code before and after transfers
- **State Synchronization**: Update external state during transfers
- **Compliance Features**: Implement KYC/AML or other regulatory requirements

### How Transfer Hooks Work in HookAMM

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRANSFER HOOK FLOW                           │
└─────────────────────────────────────────────────────────────────┘

Regular Token Transfer:
Token Program → Transfer tokens → Complete

Token-2022 with Hooks:
Token-2022 Program → Pre-transfer Hook → Transfer → Post-transfer Hook → Complete
                         │                           │
                         ▼                           ▼
                   Hook Program              Hook Program
                   (Custom logic)           (Cleanup/events)
```

### Implementation in HookAMM

The program uses a specialized `perform_token_transfer` function in `utils.rs` that automatically detects and handles transfer hooks:

```rust
pub fn perform_token_transfer<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
    remaining_accounts: &[AccountInfo<'info>], // ← Hook accounts passed here
) -> Result<()> {
    // Detect if this is Token-2022 with transfer hooks
    let is_token_2022 = token_program.key() == token_2022::ID;
    
    if is_token_2022 && !remaining_accounts.is_empty() {
        // Execute transfer with hook support
        let mut accounts = vec![
            from.to_account_info(),
            mint.to_account_info(),
            to.to_account_info(),
            authority.to_account_info(),
        ];
        
        // Add hook program accounts
        for account in remaining_accounts {
            accounts.push(account.clone());
        }
        
        // Build transfer instruction with hook support
        let transfer_ix = anchor_spl::token_2022::spl_token_2022::instruction::transfer_checked(
            &token_program.key(),
            &from.key(),
            &mint.key(),
            &to.key(),
            &authority.key(),
            &[],
            amount,
            mint.decimals,
        )?;
        
        // Execute with all required accounts
        anchor_lang::solana_program::program::invoke_signed(&transfer_ix, &accounts, signer_seeds)?;
    } else {
        // Standard SPL transfer without hooks
        let cpi_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            anchor_spl::token_interface::TransferChecked {
                from: from.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
            },
            signer_seeds
        );
        
        anchor_spl::token_interface::transfer_checked(cpi_ctx, amount, mint.decimals)?;
    }
    
    Ok(())
}
```

### Hook Execution Sequence

When a buy/sell transaction involves a token with transfer hooks:

```
1. User initiates buy/sell
2. HookAMM processes SOL transfers
3. HookAMM calls perform_token_transfer()
4. Function detects Token-2022 + remaining_accounts
5. Pre-transfer hook executes:
   ├── Validate transfer
   ├── Apply custom logic
   └── Can reject if needed
6. Actual token transfer occurs
7. Post-transfer hook executes:
   ├── Update external state
   ├── Emit custom events
   └── Cleanup operations
8. HookAMM updates reserves
9. Transaction completes
```

### Using Transfer Hooks with HookAMM

#### Client-Side Implementation

```typescript
// For regular SPL tokens (no hooks)
await program.methods
  .buy(solAmount, minTokenAmount)
  .accounts({
    // ... standard accounts
  })
  .rpc();

// For Token-2022 tokens with transfer hooks
await program.methods
  .buy(solAmount, minTokenAmount)
  .accounts({
    // ... standard accounts
  })
  .remainingAccounts([
    // Hook program accounts (order matters!)
    { pubkey: hookProgramId, isSigner: false, isWritable: false },
    { pubkey: hookStateAccount, isSigner: false, isWritable: true },
    { pubkey: extraMetadataAccount, isSigner: false, isWritable: false },
    // ... any other accounts the hook needs
  ])
  .rpc();
```

#### Hook Account Discovery

To find the required hook accounts, query the mint:

```typescript
import { getExtraAccountMetaAddress, getExtraAccountMetas } from '@solana/spl-token';

// Get hook program from mint
const mintInfo = await getMint(connection, mintAddress, 'confirmed', TOKEN_2022_PROGRAM_ID);
const transferHookProgramId = getTransferHook(mintInfo);

if (transferHookProgramId) {
  // Get additional accounts needed by the hook
  const extraAccountMetaAddress = getExtraAccountMetaAddress(mintAddress, transferHookProgramId);
  const extraAccountMetas = await getExtraAccountMetas(
    connection,
    extraAccountMetaAddress,
    'confirmed',
    TOKEN_2022_PROGRAM_ID
  );
  
  // Convert to remaining accounts format
  const remainingAccounts = extraAccountMetas.map(meta => ({
    pubkey: meta.addressConfig.address,
    isSigner: meta.isSigner,
    isWritable: meta.isWritable,
  }));
}
```

### Common Transfer Hook Use Cases

#### 1. Transfer Restrictions
```rust
// Hook can restrict transfers based on:
- Whitelist/blacklist validation
- Time-based locks
- Maximum transfer amounts
- Geographic restrictions
```

#### 2. Additional Fees
```rust
// Hook can implement:
- Burn mechanisms (deflationary tokens)
- Redistribution to holders
- Treasury accumulation
- Dynamic fee rates
```

#### 3. State Synchronization
```rust
// Hook can update:
- User statistics
- Governance voting power
- Staking balances
- External protocol state
```

#### 4. Gaming Mechanics
```rust
// Hook can handle:
- Item durability updates
- Experience point calculation
- Achievement tracking
- Inventory management
```

### Error Handling with Hooks

Transfer hooks can fail for various reasons:

```typescript
try {
  await hookAmm.buy(buyer, mint, buyParams, TOKEN_2022_PROGRAM_ID, remainingAccounts);
} catch (error) {
  if (error.toString().includes('TransferHookFailed')) {
    console.log('Transfer hook rejected the transaction');
    // Handle hook-specific logic
  } else if (error.toString().includes('SlippageExceeded')) {
    console.log('Price moved too much during execution');
  }
}
```

### Hook Compatibility

HookAMM is compatible with:
- ✅ Standard SPL tokens
- ✅ Token-2022 tokens without hooks
- ✅ Token-2022 tokens with transfer hooks
- ✅ Multiple hooks per token
- ✅ Complex hook interactions

The program automatically detects the token type and handles transfers appropriately, making it seamless for users and developers.

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

## Bonding Curve Mechanics

HookAMM implements a sophisticated bonding curve using a constant product formula with virtual and real reserves. This creates a dynamic pricing mechanism that responds to trading activity.

### Understanding the Variables

#### Reserve Types

```rust
pub struct BondingCurve {
    pub mint: Pubkey,                    // Token mint address
    pub creator: Pubkey,                 // Curve creator
    pub virtual_token_reserves: u64,    // 🔸 Virtual token liquidity
    pub virtual_sol_reserves: u64,      // 🔸 Virtual SOL liquidity  
    pub real_token_reserves: u64,       // 🔹 Actual tokens traded
    pub real_sol_reserves: u64,         // 🔹 Actual SOL collected
    pub token_total_supply: u64,        // Total token supply
    pub complete: bool,                  // Curve completion status
    pub index: u64,                     // Curve index number
}
```

#### Virtual vs Real Reserves Explained

```
┌─────────────────────────────────────────────────────────────────┐
│                    RESERVE COMPOSITION                          │
└─────────────────────────────────────────────────────────────────┘

🔸 VIRTUAL RESERVES (Set at creation, never change):
├── Purpose: Provide initial liquidity and price stability
├── virtual_token_reserves: Starting available tokens for purchase
├── virtual_sol_reserves: Starting price reference in SOL
└── Effect: Determines initial price and curve steepness

🔹 REAL RESERVES (Dynamic, change with each trade):
├── Purpose: Track actual trading activity
├── real_token_reserves: Tokens actually purchased by users
├── real_sol_reserves: SOL actually collected from sales
└── Effect: Shifts the price as trading occurs

📊 EFFECTIVE RESERVES (Used in calculations):
├── Effective SOL = virtual_sol_reserves + real_sol_reserves
├── Effective Tokens = virtual_token_reserves - real_token_reserves
└── Current Price = Effective SOL ÷ Effective Tokens
```

### Mathematical Formula

The bonding curve uses a **Constant Product Formula**:

```
k = (Virtual SOL + Real SOL) × (Virtual Tokens - Real Tokens)

Where:
- k = Constant product (liquidity constant)
- Virtual reserves = Initial liquidity parameters
- Real reserves = Cumulative trading activity
```

### Price Calculation Examples

#### Example 1: Initial State

```typescript
// Curve creation parameters
virtual_token_reserves = 1,000,000 tokens
virtual_sol_reserves = 100 SOL
real_token_reserves = 0 (no trades yet)
real_sol_reserves = 0 (no trades yet)

// Initial calculations
effective_sol = 100 + 0 = 100 SOL
effective_tokens = 1,000,000 - 0 = 1,000,000 tokens
initial_price = 100 ÷ 1,000,000 = 0.0001 SOL per token
k = 100 × 1,000,000 = 100,000,000
```

#### Example 2: After First Buy

```typescript
// User buys with 10 SOL (9.9 SOL after 1% fee)
sol_input = 9.9 SOL

// Calculate tokens received
new_sol_reserves = 100 + 9.9 = 109.9 SOL
new_token_reserves = 100,000,000 ÷ 109.9 = 909,917 tokens
tokens_purchased = 1,000,000 - 909,917 = 90,083 tokens

// Update real reserves
real_sol_reserves = 0 + 9.9 = 9.9 SOL
real_token_reserves = 0 + 90,083 = 90,083 tokens

// New effective reserves
effective_sol = 100 + 9.9 = 109.9 SOL
effective_tokens = 1,000,000 - 90,083 = 909,917 tokens
new_price = 109.9 ÷ 909,917 = 0.0001208 SOL per token

// Price increased by: (0.0001208 - 0.0001) ÷ 0.0001 = 20.8%
```

### Price Impact Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                    BONDING CURVE SHAPE                         │
└─────────────────────────────────────────────────────────────────┘

Price │
  ^   │      ┌─────────────────────────────
  │   │    ┌─┘                            
  │   │  ┌─┘    ← Price increases as tokens are bought
  │   │┌─┘       (SOL reserves grow, token reserves shrink)
  │   └─────────────────────────────────────────► Tokens Sold
      │
Initial Price (determined by virtual reserves ratio)

Mathematical relationship:
- More tokens bought = Higher price (exponential growth)
- More tokens sold = Lower price (exponential decay)
- Virtual reserves = "Price floor" and liquidity depth
```

### Variable Impact on Price Curves

#### High Virtual SOL (Expensive Launch)

```typescript
{
  virtual_token_reserves: 1_000_000,  // 1M tokens
  virtual_sol_reserves: 1000,         // 1000 SOL
}
// Initial price: 1000 ÷ 1,000,000 = 0.001 SOL per token (EXPENSIVE)
// Effect: High starting price, steep price increases
```

#### Low Virtual SOL (Cheap Launch)

```typescript
{
  virtual_token_reserves: 1_000_000,  // 1M tokens  
  virtual_sol_reserves: 1,            // 1 SOL
}
// Initial price: 1 ÷ 1,000,000 = 0.000001 SOL per token (CHEAP)
// Effect: Low starting price, gradual price increases
```

#### High Virtual Tokens (Stable Pricing)

```typescript
{
  virtual_token_reserves: 10_000_000, // 10M tokens
  virtual_sol_reserves: 100,          // 100 SOL
}
// Effect: More liquidity depth, smaller price impact per trade
```

#### Low Virtual Tokens (Volatile Pricing)

```typescript
{
  virtual_token_reserves: 100_000,    // 100K tokens
  virtual_sol_reserves: 100,          // 100 SOL  
}
// Effect: Less liquidity depth, larger price impact per trade
```

### Trading Calculations

#### Buy Transaction Flow

```
1. User inputs: sol_amount = 10 SOL

2. Calculate fee:
   fee = 10 × 1% = 0.1 SOL
   sol_after_fee = 10 - 0.1 = 9.9 SOL

3. Calculate effective reserves:
   current_sol = virtual_sol_reserves + real_sol_reserves
   current_tokens = virtual_token_reserves - real_token_reserves

4. Apply constant product formula:
   k = current_sol × current_tokens
   new_sol = current_sol + sol_after_fee
   new_tokens = k ÷ new_sol
   tokens_out = current_tokens - new_tokens

5. Update real reserves:
   real_sol_reserves += sol_after_fee
   real_token_reserves += tokens_out
```

#### Sell Transaction Flow

```
1. User inputs: token_amount = 1000 tokens

2. Calculate effective reserves:
   current_sol = virtual_sol_reserves + real_sol_reserves  
   current_tokens = virtual_token_reserves - real_token_reserves

3. Apply constant product formula:
   k = current_sol × current_tokens
   new_tokens = current_tokens + token_amount
   new_sol = k ÷ new_tokens
   sol_out = current_sol - new_sol

4. Calculate fee:
   fee = sol_out × 1% = sol_out × 0.01
   sol_after_fee = sol_out - fee

5. Update real reserves:
   real_sol_reserves -= sol_out
   real_token_reserves -= token_amount
```

### Price Discovery Mechanism

The bonding curve creates automatic price discovery through:

1. **Supply Pressure**: As tokens are bought, available supply decreases
2. **Demand Premium**: Higher demand leads to exponentially higher prices  
3. **Liquidity Depth**: Virtual reserves provide baseline liquidity
4. **Market Efficiency**: Arbitrage opportunities maintain fair pricing

### Curve Completion

Curves can be designed to "complete" when certain conditions are met:

```rust
// Example completion condition (can be customized)
let completion_threshold = virtual_token_reserves * 90 / 100; // 90% of tokens sold

if real_token_reserves >= completion_threshold {
    bonding_curve.complete = true;
    // Could migrate to a traditional AMM like Raydium
}
```

### Gas Optimization Notes

- All calculations use checked math to prevent overflow
- Virtual reserves are stored once, real reserves updated per trade
- Price calculations happen off-chain for quotes, on-chain for execution
- Constant product formula provides O(1) time complexity

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