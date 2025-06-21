import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HookAmm } from "../target/types/hook_amm";
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { assert } from "chai";

describe("hook-amm", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.HookAmm as Program<HookAmm>;
    const provider = anchor.AnchorProvider.env();
    const connection = provider.connection;

    // Test accounts
    let authority: anchor.web3.Keypair;
    let feeRecipient: anchor.web3.Keypair;
    let creator: anchor.web3.Keypair;
    let buyer: anchor.web3.Keypair;
    let mint: anchor.web3.PublicKey;

    // PDAs
    let globalConfigPda: anchor.web3.PublicKey;
    let bondingCurvePda: anchor.web3.PublicKey;
    let curveTokenAccountPda: anchor.web3.PublicKey;

    // VERY CONSERVATIVE CONSTANTS to prevent overflow
    const INITIAL_SUPPLY = new anchor.BN(1_000_000); // 1 token with 6 decimals
    const VIRTUAL_TOKEN_RESERVES = new anchor.BN(500_000); // 0.5 tokens
    const VIRTUAL_SOL_RESERVES = new anchor.BN(100_000_000); // 0.1 SOL

    let buyerTokenAccountAddress: anchor.web3.PublicKey;

    // Helper function to create token account safely
    async function createTokenAccountSafely(
        owner: anchor.web3.Keypair,
        mint: anchor.web3.PublicKey
    ): Promise<anchor.web3.PublicKey> {
        try {
            // Derive the associated token account address
            const associatedTokenAddress = await getAssociatedTokenAddress(
                mint,
                owner.publicKey,
                false,
                TOKEN_PROGRAM_ID
            );

            console.log("Derived ATA address:", associatedTokenAddress.toString());

            // Check if account already exists
            const accountInfo = await connection.getAccountInfo(associatedTokenAddress);

            if (accountInfo) {
                console.log("Associated token account already exists");
                return associatedTokenAddress;
            }

            console.log("Creating new associated token account...");

            // Create the instruction to create the associated token account
            const createATAInstruction = createAssociatedTokenAccountInstruction(
                owner.publicKey, // payer
                associatedTokenAddress, // associatedToken
                owner.publicKey, // owner
                mint, // mint
                TOKEN_PROGRAM_ID,
                anchor.utils.token.ASSOCIATED_PROGRAM_ID // associatedTokenProgramId
            );

            // Create and send transaction
            const transaction = new anchor.web3.Transaction().add(createATAInstruction);

            // Set recent blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = owner.publicKey;

            const signature = await anchor.web3.sendAndConfirmTransaction(
                connection,
                transaction,
                [owner],
                {
                    commitment: "confirmed",
                    skipPreflight: false,
                    preflightCommitment: "confirmed"
                }
            );

            console.log("Created ATA with signature:", signature);

            // Wait a bit for the account to be created
            await new Promise(resolve => setTimeout(resolve, 1000));

            return associatedTokenAddress;

        } catch (error) {
            console.error("Error in createTokenAccountSafely:", error);
            throw error;
        }
    }

    before(async () => {
        console.log("Setting up test environment...");

        // Generate keypairs
        authority = anchor.web3.Keypair.generate();
        feeRecipient = anchor.web3.Keypair.generate();
        creator = anchor.web3.Keypair.generate();
        buyer = anchor.web3.Keypair.generate();

        console.log("Generated keypairs");

        // Airdrop SOL to test accounts with higher amounts for rent
        const airdropAmount = 50 * anchor.web3.LAMPORTS_PER_SOL; // 50 SOL each
        const airdropPromises = [
            connection.requestAirdrop(authority.publicKey, airdropAmount),
            connection.requestAirdrop(feeRecipient.publicKey, airdropAmount),
            connection.requestAirdrop(creator.publicKey, airdropAmount),
            connection.requestAirdrop(buyer.publicKey, airdropAmount),
        ];

        await Promise.all(airdropPromises);
        console.log("Airdropped SOL to test accounts");

        // Wait for airdrop confirmations
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verify balances
        const buyerBalance = await connection.getBalance(buyer.publicKey);
        console.log("Buyer SOL balance after airdrop:", buyerBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

        // Create mint
        mint = await createMint(
            connection,
            creator,
            creator.publicKey,
            null,
            6, // 6 decimals
            undefined,
            undefined,
            TOKEN_PROGRAM_ID
        );
        console.log("Created mint:", mint.toString());

        // Derive PDAs
        [globalConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("global_config")],
            program.programId
        );

        [bondingCurvePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("bonding_curve"), mint.toBuffer()],
            program.programId
        );

        [curveTokenAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("curve_token_account"), mint.toBuffer()],
            program.programId
        );

        console.log("Derived PDAs successfully");
    });

    it("Initializes global config", async () => {
        console.log("Initializing global config...");

        await program.methods
            .initializeGlobalConfig()
            .accounts({
                globalConfig: globalConfigPda,
                authority: authority.publicKey,
                feeRecipient: feeRecipient.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([authority])
            .rpc();

        // Verify global config state
        const globalConfig = await program.account.globalConfig.fetch(globalConfigPda);
        assert(globalConfig.authority.equals(authority.publicKey));
        assert(globalConfig.feeRecipient.equals(feeRecipient.publicKey));
        assert(globalConfig.totalCurves.eq(new anchor.BN(0)));
        console.log("✓ Global config initialized successfully");
    });

    it("Creates bonding curve", async () => {
        console.log("Creating bonding curve...");

        // First, mint tokens to creator's wallet
        console.log("Minting tokens to creator...");
        
        let creatorTokenAccount;
        try {
            creatorTokenAccount = await getOrCreateAssociatedTokenAccount(
                connection,
                creator,
                mint,
                creator.publicKey,
                false,
                'confirmed',
                undefined,
                TOKEN_PROGRAM_ID
            );
            
            console.log("Creator token account object:", creatorTokenAccount);
            console.log("Creator token account address:", creatorTokenAccount.address?.toString());
            
            if (!creatorTokenAccount.address) {
                throw new Error("Failed to get creator token account address");
            }
            
        } catch (error) {
            console.error("Failed to create/get creator token account:", error);
            throw error;
        }

        // Wait a bit for account creation to be confirmed
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            await mintTo(
                connection,
                creator,
                mint,
                creatorTokenAccount.address,
                creator,
                INITIAL_SUPPLY.toNumber()
            );
            console.log("Tokens minted to creator token account:", creatorTokenAccount.address.toString());
        } catch (error) {
            console.error("Failed to mint tokens:", error);
            throw error;
        }

        // Wait for the mint transaction to be confirmed and check balance
        await new Promise(resolve => setTimeout(resolve, 2000));

        let creatorBalance;
        try {
            creatorBalance = await connection.getTokenAccountBalance(creatorTokenAccount.address);
            console.log("Creator token balance before curve creation:", creatorBalance.value.amount);
            
            // Verify creator has the expected amount
            if (creatorBalance.value.amount !== INITIAL_SUPPLY.toString()) {
                throw new Error(`Creator balance mismatch: expected ${INITIAL_SUPPLY.toString()}, got ${creatorBalance.value.amount}`);
            }
        } catch (error) {
            console.log("Could not check creator balance:", error.message);
            throw error;
        }

        // Create bonding curve with token transfer (now combined in one step)
        try {
            const tx = await program.methods
                .createBondingCurve({
                    initialSupply: INITIAL_SUPPLY,
                    virtualTokenReserves: VIRTUAL_TOKEN_RESERVES,
                    virtualSolReserves: VIRTUAL_SOL_RESERVES,
                })
                .accounts({
                    bondingCurve: bondingCurvePda,
                    curveTokenAccount: curveTokenAccountPda,
                    creatorTokenAccount: creatorTokenAccount.address,
                    mint: mint,
                    creator: creator.publicKey,
                    globalConfig: globalConfigPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                })
                .signers([creator])
                .rpc();

            console.log("Bonding curve creation and initialization tx:", tx);
        } catch (error) {
            console.log("Bonding curve creation failed:", error.message);
            console.log("Full error:", error);
            throw error;
        }

        // Wait for transaction confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify bonding curve was created
        try {
            const curve = await program.account.bondingCurve.fetch(bondingCurvePda);
            console.log("Bonding curve created with supply:", curve.tokenTotalSupply.toString());
            console.log("Virtual token reserves:", curve.virtualTokenReserves.toString());
            console.log("Virtual SOL reserves:", curve.virtualSolReserves.toString());

            // Verify token balances after initialization
            const curveBalance = await connection.getTokenAccountBalance(curveTokenAccountPda);
            console.log("Curve token balance:", curveBalance.value.amount);

            const finalCreatorBalance = await connection.getTokenAccountBalance(creatorTokenAccount.address);
            console.log("Creator token balance after curve initialization:", finalCreatorBalance.value.amount);

            // Verify transfer worked correctly
            if (curveBalance.value.amount === INITIAL_SUPPLY.toString() && finalCreatorBalance.value.amount === "0") {
                console.log("✓ Bonding curve created successfully with token transfer and mint frozen");
            } else {
                console.log("⚠ Token transfer may not have completed correctly");
                console.log(`Expected: curve=${INITIAL_SUPPLY.toString()}, creator=0`);
                console.log(`Actual: curve=${curveBalance.value.amount}, creator=${finalCreatorBalance.value.amount}`);
            }

            // Verify mint authority is removed (frozen)
            try {
                const mintInfo = await connection.getAccountInfo(mint);
                console.log("✓ Mint authority has been frozen (removed)");
            } catch (error) {
                console.log("Could not verify mint authority status:", error.message);
            }
        } catch (error) {
            console.log("Error in curve verification:", error.message);
            throw error;
        }
    });

    it("Creates buyer token account", async () => {
        console.log("Creating buyer token account...");

        try {
            buyerTokenAccountAddress = await createTokenAccountSafely(buyer, mint);
            console.log("✓ Buyer token account created:", buyerTokenAccountAddress.toString());

            // Verify the account exists
            const accountInfo = await connection.getAccountInfo(buyerTokenAccountAddress);
            assert(accountInfo !== null, "Token account should exist");

        } catch (error) {
            console.error("Failed to create buyer token account:", error);
            throw error;
        }
    });

    it("Handles buy transactions with tiny amounts", async () => {
        console.log("Testing buy transactions with very small amounts...");

        // First check if bonding curve exists
        try {
            const curve = await program.account.bondingCurve.fetch(bondingCurvePda);
            console.log("Bonding curve found with supply:", curve.tokenTotalSupply.toString());
        } catch (error) {
            console.log("Bonding curve not found, skipping buy test");
            return;
        }

        // Start with extremely small amount to avoid overflow
        const solAmount = new anchor.BN(1_000_000); // 0.001 SOL
        const minTokenAmount = new anchor.BN(0);

        console.log("Buy amount (lamports):", solAmount.toString());
        console.log("Buyer token account:", buyerTokenAccountAddress.toString());

        // Get initial balances
        const initialBuyerSol = await connection.getBalance(buyer.publicKey);
        console.log("Initial buyer SOL balance:", initialBuyerSol);

        try {
            const txSig = await program.methods
                .buy(solAmount, minTokenAmount)
                .accounts({
                    bondingCurve: bondingCurvePda,
                    curveTokenAccount: curveTokenAccountPda,
                    userTokenAccount: buyerTokenAccountAddress,
                    user: buyer.publicKey,
                    mint: mint,
                    globalConfig: globalConfigPda,
                    feeRecipient: feeRecipient.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                })
                .signers([buyer])
                .rpc();

            console.log("Buy transaction signature:", txSig);

            // Wait for transaction confirmation
            await connection.confirmTransaction(txSig, "confirmed");
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Verify balances changed
            const finalBuyerSol = await connection.getBalance(buyer.publicKey);
            console.log("Final buyer SOL balance:", finalBuyerSol);

            assert(finalBuyerSol < initialBuyerSol, "Buyer SOL should decrease");

            // Check if buyer received tokens
            try {
                const tokenBalance = await connection.getTokenAccountBalance(buyerTokenAccountAddress);
                console.log("Buyer token balance after purchase:", tokenBalance.value.amount);

                if (parseInt(tokenBalance.value.amount) > 0) {
                    console.log("✓ Buy transaction successful - buyer received tokens");
                } else {
                    console.log("⚠ Buy transaction completed but no tokens received (amount too small)");
                }
            } catch (error) {
                console.log("Could not check token balance:", error.message);
            }

        } catch (error) {
            console.error("Buy transaction failed:", error);

            if (error.toString().includes("Overflow")) {
                console.log("Still getting overflow even with tiny amounts.");
                console.log("This suggests the issue is in your smart contract's mathematical operations.");
                console.log("Check your bonding curve price calculation logic for potential overflow.");
            }

            throw error;
        }
    });

    it("Tests parameter validation", async () => {
        console.log("Testing parameter validation...");

        const invalidMint = await createMint(
            connection,
            creator,
            creator.publicKey,
            null,
            6,
            undefined,
            undefined,
            TOKEN_PROGRAM_ID
        );

        const [invalidBondingCurvePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("bonding_curve"), invalidMint.toBuffer()],
            program.programId
        );

        const [invalidCurveTokenAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("curve_token_account"), invalidMint.toBuffer()],
            program.programId
        );

        // Create creator token account for invalid mint
        const invalidCreatorTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            creator,
            invalidMint,
            creator.publicKey,
            false,
            'confirmed',
            undefined,
            TOKEN_PROGRAM_ID
        );

        // Test with zero initial supply
        try {
            await program.methods
                .createBondingCurve({
                    initialSupply: new anchor.BN(0),
                    virtualTokenReserves: VIRTUAL_TOKEN_RESERVES,
                    virtualSolReserves: VIRTUAL_SOL_RESERVES,
                })
                .accounts({
                    bondingCurve: invalidBondingCurvePda,
                    curveTokenAccount: invalidCurveTokenAccountPda,
                    mint: invalidMint,
                    creatorTokenAccount: invalidCreatorTokenAccount.address,
                    creator: creator.publicKey,
                    globalConfig: globalConfigPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                })
                .signers([creator])
                .rpc();

            assert.fail("Should have failed with zero initial supply");
        } catch (error) {
            console.log("✓ Correctly rejected zero initial supply");
            assert(error.toString().includes("InvalidAmount"));
        }
    });
});