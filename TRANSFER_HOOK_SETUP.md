# Transfer Hook Integration - Setup Instructions

## Overview
This project integrates Token-2022 transfer hooks into the Hook AMM. The test failure you're experiencing is because the transfer hook program needs to be deployed before running tests.

## Fix for Test #5: Create Token-2022 liquidity pool

The error occurs because the transfer hook program at `3EdtauQzRb6spJ3ctDPxx8UibaQuFK3y9j4cNYufwWwM` is not deployed on your local validator.

### Solution Steps:

1. **Build both programs:**
```bash
anchor build
```

2. **Deploy the transfer hook program first:**
```bash
# Deploy transfer hook program
anchor deploy --program-name transfer_hook --provider.cluster localnet

# Or manually:
solana program deploy target/deploy/transfer_hook.so --program-id 3EdtauQzRb6spJ3ctDPxx8UibaQuFK3y9j4cNYufwWwM
```

3. **Deploy the hook AMM program:**
```bash
# Deploy hook AMM program
anchor deploy --program-name hook_amm --provider.cluster localnet

# Or manually:
solana program deploy target/deploy/hook_amm.so --program-id ACiqDj8vQMe4E7HLGBaNYp5iKdBUMHUKEA2H6ghuxk5M
```

4. **Run tests:**
```bash
anchor test --skip-deploy
```

### Alternative: Use Anchor's auto-deployment

If you want Anchor to handle deployment automatically:

```bash
# This will build, deploy all programs, and run tests
anchor test
```

### Understanding the Error

The error message:
```
Unknown program 3EdtauQzRb6spJ3ctDPxx8UibaQuFK3y9j4cNYufwWwM
```

This occurs when Token-2022 tries to invoke the transfer hook program but it's not deployed. Token-2022 with transfer hooks requires:
1. The hook program to be deployed at the specified address
2. The hook program to be properly initialized for the mint
3. The correct additional accounts to be passed during transfers

### Program Architecture

1. **Hook AMM Program** (`ACiqDj8vQMe4E7HLGBaNYp5iKdBUMHUKEA2H6ghuxk5M`):
   - Modified to support Token-2022 with transfer hooks
   - Uses `perform_token_transfer` utility to handle both regular and hook transfers
   - Passes remaining accounts for hook execution

2. **Transfer Hook Program** (`3EdtauQzRb6spJ3ctDPxx8UibaQuFK3y9j4cNYufwWwM`):
   - Implements SPL Transfer Hook Interface
   - Tracks transfer count in a counter account
   - Rejects transfers over 50 tokens (example business logic)

### Key Changes Made

1. **Updated `buy.rs`, `sell.rs`, and `create_bonding_curve.rs`**:
   - Added support for remaining accounts
   - Use new `perform_token_transfer` utility function

2. **Added `utils.rs`**:
   - `perform_token_transfer` function that handles both regular and hook transfers
   - Automatically detects Token-2022 and includes hook accounts

3. **Updated test suite**:
   - Creates Token-2022 mint with transfer hook extension
   - Initializes transfer hook program
   - Passes additional accounts for hook execution
   - Tests hook behavior (counter increment, transfer rejection)

### Troubleshooting

If you still get errors after deployment:

1. **Check program deployment:**
```bash
solana program show 3EdtauQzRb6spJ3ctDPxx8UibaQuFK3y9j4cNYufwWwM
solana program show ACiqDj8vQMe4E7HLGBaNYp5iKdBUMHUKEA2H6ghuxk5M
```

2. **Ensure you're on localnet:**
```bash
solana config get
# Should show: http://localhost:8899
```

3. **Check logs for more details:**
```bash
solana logs | grep "3EdtauQzRb6spJ3ctDPxx8UibaQuFK3y9j4cNYufwWwM"
```

4. **Verify the transfer hook program built correctly:**
```bash
ls -la target/deploy/transfer_hook.so
```

If the file doesn't exist, make sure both programs are in the workspace and run `anchor build` again.
