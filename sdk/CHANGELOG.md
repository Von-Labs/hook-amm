# Changelog

All notable changes to the HookAMM SDK will be documented in this file.

## [0.2.0] - 2024-01-XX

### Added
- 🪝 **Automatic Transfer Hook Handling**: The SDK now automatically detects and handles Token-2022 transfer hooks
- 🔍 **Transfer Hook Detection**: New `isTokenWithHooks()` method to check if a token has transfer hooks
- 🔧 **Transfer Hook Account Resolution**: Automatic resolution of transfer hook accounts including:
  - Transfer hook program accounts
  - Extra account meta lists
  - Counter PDAs
  - Custom hook-specific accounts
- 📖 **Transfer Hook Example**: Complete example showing how to use transfer hooks with HookAMM
- 🛡️ **Error Handling**: Better error handling for transfer hook-related issues

### Changed
- 🔄 **Breaking**: `buy()` and `sell()` methods now accept transfer hook accounts as objects with `{ pubkey, isSigner, isWritable }` instead of just `PublicKey[]`
- 🔄 **Breaking**: `getTransferHookAccountsForTrade()` now returns full account metadata instead of just public keys
- ⚡ **Performance**: Optimized transfer hook account resolution with caching
- 📝 **Documentation**: Updated all examples to show transfer hook usage

### Fixed
- 🐛 **Transfer Hook Program Missing**: Fixed issue where transfer hook program wasn't included in remaining accounts
- 🐛 **Account Resolution**: Fixed PDA resolution for hook-specific accounts
- 🐛 **Token Program Detection**: Improved Token-2022 vs SPL Token detection

### Technical Details
- The SDK automatically calls `getTransferHookAccounts()` for all buy/sell operations
- Transfer hook program account is always placed first in remaining accounts (critical requirement)
- Graceful fallback when hook accounts cannot be resolved
- Support for complex hook configurations with multiple required accounts

## [0.1.0] - 2024-01-XX

### Added
- 🚀 Initial release of HookAMM SDK
- 💰 Basic buy/sell functionality for bonding curves
- 📊 Price quote calculations
- 🎯 Bonding curve creation and management
- 🔍 Global config and curve data fetching
- 📐 Mathematical utilities for bonding curve calculations
- 🏗️ TypeScript support with full type definitions

### Features
- Support for SPL tokens and basic Token-2022 tokens
- Bonding curve trading with customizable parameters
- Slippage protection
- Fee calculation and handling
- Associated token account creation
- PDA derivation utilities

---

## Migration Guide

### From 0.1.x to 0.2.x

#### Transfer Hook Accounts Parameter Change

**Before (0.1.x):**
```typescript
// Old way - just public keys
const hookAccounts: PublicKey[] = [hookProgram, extraAccount];
await hookAmm.buy(params, wallet, hookAccounts);
```

**After (0.2.x):**
```typescript
// New way - full account metadata (or let SDK handle automatically)
const hookAccounts = [
  { pubkey: hookProgram, isSigner: false, isWritable: false },
  { pubkey: extraAccount, isSigner: false, isWritable: true }
];
await hookAmm.buy(params, wallet, hookAccounts);

// Or better - let SDK handle automatically:
await hookAmm.buy(params, wallet); // No hook accounts needed!
```

#### Automatic Transfer Hook Handling

The biggest improvement is that you **no longer need to manually provide transfer hook accounts** for most use cases:

```typescript
// 0.2.x - Automatic transfer hook handling
const hookAmm = new HookAmmClient(connection, wallet, idl);

// SDK automatically detects and handles transfer hooks
await hookAmm.buy(buyParams, wallet);
await hookAmm.sell(sellParams, wallet);

// Check if token has hooks
const hasHooks = await hookAmm.isTokenWithHooks(tokenMint);
```

#### Error Handling

New error types to handle:
- `AmountTooBig`: Transfer amount exceeds hook validation limit
- `Account required by instruction is missing`: Usually handled automatically now

```typescript
try {
  await hookAmm.buy(params, wallet);
} catch (error) {
  if (error.toString().includes('AmountTooBig')) {
    console.log('Try a smaller amount - transfer hook limit exceeded');
  }
}
```