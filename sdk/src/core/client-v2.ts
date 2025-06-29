import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, Idl } from '@coral-xyz/anchor';
import { 
  TOKEN_PROGRAM_ID, 
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import BN from 'bn.js';

import { PROGRAM_ID } from './constants';
import { 
  GlobalConfig, 
  BondingCurve, 
  CreateBondingCurveParams, 
  BuyParams, 
  SellParams,
  PriceQuote,
  SwapResult,
  WalletAdapter,
  SignerType,
  SendTransactionOptions
} from '../types';
import { 
  getGlobalConfigPDA, 
  getBondingCurvePDA, 
  getCurveTokenAccountPDA,
  calculateBuyAmount,
  calculateSellAmount,
  calculateTokenPrice,
  calculatePriceImpact,
  getTokenProgramId,
  getMintInfo,
  getTransferHookAccounts,
  hasTransferHooks,
  isKeypair,
  isWalletAdapter,
  getSignerPublicKey,
  sendTransaction,
  createWalletFromKeypair
} from '../utils';

/**
 * Enhanced HookAMM Client that supports both wallet adapters and keypairs
 */
export class HookAmmClient {
  private connection: Connection;
  private wallet: Wallet;
  private provider: AnchorProvider;
  private program: Program;

  constructor(connection: Connection, wallet: Wallet, programIdl: Idl) {
    this.connection = connection;
    this.wallet = wallet;
    this.provider = new AnchorProvider(connection, wallet, {});
    this.program = new Program(programIdl, this.provider);
  }

  /**
   * Alternative constructor that accepts wallet adapters or keypairs
   */
  static create(
    connection: Connection, 
    signer: SignerType, 
    programIdl: Idl
  ): HookAmmClient {
    let wallet: Wallet;
    
    if (isKeypair(signer)) {
      wallet = new Wallet(signer);
    } else if (isWalletAdapter(signer)) {
      // Convert WalletAdapter to Anchor Wallet
      // Create a minimal keypair for payer property (not used for actual signing)
      const dummyKeypair = Keypair.generate();
      wallet = {
        publicKey: signer.publicKey!,
        payer: dummyKeypair, // Required by Anchor but not used
        signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
          if (!signer.signTransaction) {
            throw new Error('Wallet does not support signing transactions');
          }
          const signed = await signer.signTransaction(tx as Transaction);
          return signed as T;
        },
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
          if (signer.signAllTransactions) {
            const signed = await signer.signAllTransactions(txs as Transaction[]);
            return signed as T[];
          } else if (signer.signTransaction) {
            const signed = [];
            for (const tx of txs) {
              const signedTx = await signer.signTransaction(tx as Transaction);
              signed.push(signedTx as T);
            }
            return signed;
          }
          throw new Error('Wallet does not support signing transactions');
        }
      };
    } else {
      throw new Error('Invalid signer type');
    }
    
    return new HookAmmClient(connection, wallet, programIdl);
  }

  // Initialize global configuration (supports both signer types)
  async initializeGlobalConfig(
    authority: PublicKey,
    feeRecipient: PublicKey,
    signer?: SignerType, // Optional - falls back to wallet
    options?: SendTransactionOptions
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const actualSigner = signer || this.wallet;
    const signerPubkey = signer ? getSignerPublicKey(signer) : this.wallet.publicKey;

    const instruction = await this.program.methods
      .initializeGlobalConfig()
      .accounts({
        globalConfig,
        authority: signerPubkey,
        feeRecipient,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const transaction = new Transaction().add(instruction);
    
    if (signer && !isKeypair(signer)) {
      // Using wallet adapter
      return await sendTransaction(this.connection, transaction, signer, options);
    } else {
      // Using keypair or wallet
      const keypairSigner = signer as Keypair || (this.wallet as any).payer;
      return await this.program.methods
        .initializeGlobalConfig()
        .accounts({
          globalConfig,
          authority: signerPubkey,
          feeRecipient,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypairSigner])
        .rpc();
    }
  }

  // Create a new bonding curve (supports both signer types)
  async createBondingCurve(
    params: CreateBondingCurveParams,
    signer?: SignerType, // Optional - falls back to wallet
    options?: SendTransactionOptions
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const [bondingCurve] = getBondingCurvePDA(params.tokenMint);
    const [curveTokenAccount] = getCurveTokenAccountPDA(bondingCurve, params.tokenMint);
    
    const actualSigner = signer || this.wallet;
    const signerPubkey = signer ? getSignerPublicKey(signer) : this.wallet.publicKey;

    const tokenProgramId = await getTokenProgramId(this.connection, params.tokenMint);
    const creatorTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      signerPubkey,
      false,
      tokenProgramId
    );

    const instruction = await this.program.methods
      .createBondingCurve(
        params.initialVirtualTokenReserves,
        params.initialVirtualSolReserves,
        params.initialRealTokenReserves,
        params.tokenTotalSupply
      )
      .accounts({
        globalConfig,
        bondingCurve,
        mint: params.tokenMint,
        curveTokenAccount,
        creatorTokenAccount,
        creator: signerPubkey,
        tokenProgram: tokenProgramId,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const transaction = new Transaction().add(instruction);

    if (signer && !isKeypair(signer)) {
      // Using wallet adapter
      return await sendTransaction(this.connection, transaction, signer, options);
    } else {
      // Using keypair or wallet
      const keypairSigner = signer as Keypair || (this.wallet as any).payer;
      return await this.program.methods
        .createBondingCurve(
          params.initialVirtualTokenReserves,
          params.initialVirtualSolReserves,
          params.initialRealTokenReserves,
          params.tokenTotalSupply
        )
        .accounts({
          globalConfig,
          bondingCurve,
          mint: params.tokenMint,
          curveTokenAccount,
          creatorTokenAccount,
          creator: signerPubkey,
          tokenProgram: tokenProgramId,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypairSigner])
        .rpc();
    }
  }

  // Buy tokens with SOL (supports both signer types)
  async buy(
    params: BuyParams,
    signer?: SignerType, // Optional - falls back to wallet
    additionalHookAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [],
    options?: SendTransactionOptions
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const bondingCurveData = await this.getBondingCurve(params.bondingCurve);
    const [curveTokenAccount] = getCurveTokenAccountPDA(params.bondingCurve, bondingCurveData.mint);

    const actualSigner = signer || this.wallet;
    const signerPubkey = signer ? getSignerPublicKey(signer) : this.wallet.publicKey;

    const tokenProgramId = await getTokenProgramId(this.connection, bondingCurveData.mint);
    const userTokenAccount = await getAssociatedTokenAddress(
      bondingCurveData.mint,
      signerPubkey,
      false,
      tokenProgramId
    );

    const instructions = [];

    // Create associated token account if it doesn't exist
    const userTokenAccountInfo = await this.connection.getAccountInfo(userTokenAccount);
    if (!userTokenAccountInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          signerPubkey,
          userTokenAccount,
          signerPubkey,
          bondingCurveData.mint,
          tokenProgramId
        )
      );
    }

    // Automatically get transfer hook accounts
    const transferHookAccounts = await getTransferHookAccounts(
      this.connection,
      bondingCurveData.mint,
      curveTokenAccount,
      userTokenAccount,
      signerPubkey,
      BigInt(params.solAmount.toString())
    );

    // Combine automatic and additional hook accounts
    const allHookAccounts = [...transferHookAccounts, ...additionalHookAccounts];

    const buyInstruction = await this.program.methods
      .buy(params.solAmount, params.minTokenAmount)
      .accounts({
        globalConfig,
        bondingCurve: params.bondingCurve,
        mint: bondingCurveData.mint,
        curveTokenAccount,
        userTokenAccount,
        user: signerPubkey,
        feeRecipient: (await this.getGlobalConfig()).feeRecipient,
        tokenProgram: tokenProgramId,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(allHookAccounts)
      .instruction();

    instructions.push(buyInstruction);

    const transaction = new Transaction().add(...instructions);

    if (signer && !isKeypair(signer)) {
      // Using wallet adapter
      return await sendTransaction(this.connection, transaction, signer, options);
    } else {
      // Using keypair - send manually
      const keypairSigner = signer as Keypair || (this.wallet as any).payer;
      const signature = await this.connection.sendTransaction(transaction, [keypairSigner]);
      await this.connection.confirmTransaction(signature);
      return signature;
    }
  }

  // Sell tokens for SOL (supports both signer types)
  async sell(
    params: SellParams,
    signer?: SignerType, // Optional - falls back to wallet
    additionalHookAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [],
    options?: SendTransactionOptions
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const bondingCurveData = await this.getBondingCurve(params.bondingCurve);
    const [curveTokenAccount] = getCurveTokenAccountPDA(params.bondingCurve, bondingCurveData.mint);

    const actualSigner = signer || this.wallet;
    const signerPubkey = signer ? getSignerPublicKey(signer) : this.wallet.publicKey;

    const tokenProgramId = await getTokenProgramId(this.connection, bondingCurveData.mint);
    const userTokenAccount = await getAssociatedTokenAddress(
      bondingCurveData.mint,
      signerPubkey,
      false,
      tokenProgramId
    );

    // Automatically get transfer hook accounts
    const transferHookAccounts = await getTransferHookAccounts(
      this.connection,
      bondingCurveData.mint,
      userTokenAccount,
      curveTokenAccount,
      signerPubkey,
      BigInt(params.tokenAmount.toString())
    );

    // Combine automatic and additional hook accounts
    const allHookAccounts = [...transferHookAccounts, ...additionalHookAccounts];

    const instruction = await this.program.methods
      .sell(params.tokenAmount, params.minSolAmount)
      .accounts({
        globalConfig,
        bondingCurve: params.bondingCurve,
        mint: bondingCurveData.mint,
        curveTokenAccount,
        userTokenAccount,
        user: signerPubkey,
        feeRecipient: (await this.getGlobalConfig()).feeRecipient,
        tokenProgram: tokenProgramId,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(allHookAccounts)
      .instruction();

    const transaction = new Transaction().add(instruction);

    if (signer && !isKeypair(signer)) {
      // Using wallet adapter
      return await sendTransaction(this.connection, transaction, signer, options);
    } else {
      // Using keypair or wallet
      const keypairSigner = signer as Keypair || (this.wallet as any).payer;
      return await this.program.methods
        .sell(params.tokenAmount, params.minSolAmount)
        .accounts({
          globalConfig,
          bondingCurve: params.bondingCurve,
          mint: bondingCurveData.mint,
          curveTokenAccount,
          userTokenAccount,
          user: signerPubkey,
          feeRecipient: (await this.getGlobalConfig()).feeRecipient,
          tokenProgram: tokenProgramId,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(allHookAccounts)
        .signers([keypairSigner])
        .rpc();
    }
  }

  // Get buy quote
  async getBuyQuote(bondingCurve: PublicKey, solAmount: BN): Promise<PriceQuote> {
    const curve = await this.getBondingCurve(bondingCurve);
    
    const { tokenAmount, fee } = calculateBuyAmount(
      solAmount,
      curve.virtualSolReserves,
      curve.virtualTokenReserves,
      curve.realSolReserves,
      curve.realTokenReserves
    );

    const pricePerToken = calculateTokenPrice(
      curve.virtualSolReserves,
      curve.virtualTokenReserves,
      curve.realSolReserves,
      curve.realTokenReserves
    );

    const priceImpact = calculatePriceImpact(
      solAmount,
      tokenAmount,
      curve.virtualSolReserves.add(curve.realSolReserves),
      curve.virtualTokenReserves.sub(curve.realTokenReserves)
    );

    return {
      tokenAmount,
      solAmount,
      fee,
      pricePerToken,
      priceImpact
    };
  }

  // Get sell quote
  async getSellQuote(bondingCurve: PublicKey, tokenAmount: BN): Promise<PriceQuote> {
    const curve = await this.getBondingCurve(bondingCurve);
    
    const { solAmount, fee } = calculateSellAmount(
      tokenAmount,
      curve.virtualSolReserves,
      curve.virtualTokenReserves,
      curve.realSolReserves,
      curve.realTokenReserves
    );

    const pricePerToken = calculateTokenPrice(
      curve.virtualSolReserves,
      curve.virtualTokenReserves,
      curve.realSolReserves,
      curve.realTokenReserves
    );

    const priceImpact = calculatePriceImpact(
      tokenAmount,
      solAmount,
      curve.virtualTokenReserves.sub(curve.realTokenReserves),
      curve.virtualSolReserves.add(curve.realSolReserves)
    );

    return {
      tokenAmount,
      solAmount,
      fee,
      pricePerToken,
      priceImpact
    };
  }

  // Get global configuration
  async getGlobalConfig(): Promise<GlobalConfig> {
    const [globalConfigPDA] = getGlobalConfigPDA();
    return await (this.program.account as any).globalConfig.fetch(globalConfigPDA);
  }

  // Get bonding curve data
  async getBondingCurve(bondingCurve: PublicKey): Promise<BondingCurve> {
    return await (this.program.account as any).bondingCurve.fetch(bondingCurve);
  }

  // Get all bonding curves
  async getAllBondingCurves(): Promise<{ publicKey: PublicKey; account: BondingCurve }[]> {
    return await (this.program.account as any).bondingCurve.all();
  }

  // Get bonding curves by creator
  async getBondingCurvesByCreator(creator: PublicKey): Promise<{ publicKey: PublicKey; account: BondingCurve }[]> {
    return await (this.program.account as any).bondingCurve.all([
      {
        memcmp: {
          offset: 8 + 32, // Skip discriminator and mint
          bytes: creator.toBase58(),
        },
      },
    ]);
  }

  // Get transfer hook accounts for Token-2022 transfers
  async getTransferHookAccountsForTrade(
    mintAddress: PublicKey,
    source: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    amount: BN
  ): Promise<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[]> {
    return await getTransferHookAccounts(
      this.connection,
      mintAddress,
      source,
      destination,
      owner,
      BigInt(amount.toString())
    );
  }

  // Check if a token has transfer hooks
  async isTokenWithHooks(mintAddress: PublicKey): Promise<boolean> {
    return await hasTransferHooks(this.connection, mintAddress);
  }
}

// Export both the original client and the new enhanced client
export { HookAmmClient as HookAmmClientV2 };

// Re-export the original client for backwards compatibility
export { HookAmmClient as HookAmmClientOriginal } from './client';