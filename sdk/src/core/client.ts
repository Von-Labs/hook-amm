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
   * Factory method that accepts wallet adapters or keypairs
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
      const dummyKeypair = Keypair.generate();
      wallet = {
        publicKey: signer.publicKey!,
        payer: dummyKeypair, // Required by Anchor but not used for signing
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

  /**
   * Initialize global configuration
   */
  async initializeGlobalConfig(
    authority: PublicKey,
    feeRecipient: PublicKey,
    signer?: SignerType,
    options?: SendTransactionOptions
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const signerPubkey = signer ? getSignerPublicKey(signer) : this.wallet.publicKey;

    // Ensure the signer is the authority (as required by program)
    if (!signerPubkey.equals(authority)) {
      throw new Error('Signer must be the authority for global config initialization');
    }

    if (signer && isWalletAdapter(signer)) {
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
      return await sendTransaction(this.connection, transaction, signer, options);
    } else {
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

  /**
   * Create a new bonding curve - updated to match program structure
   */
  async createBondingCurve(
    params: CreateBondingCurveParams,
    signer?: SignerType,
    options?: SendTransactionOptions
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const [bondingCurve] = getBondingCurvePDA(params.tokenMint);
    const [curveTokenAccount] = getCurveTokenAccountPDA(bondingCurve, params.tokenMint);
    
    const signerPubkey = signer ? getSignerPublicKey(signer) : this.wallet.publicKey;
    const tokenProgramId = await getTokenProgramId(this.connection, params.tokenMint);
    
    const creatorTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      signerPubkey,
      false,
      tokenProgramId
    );

    // Validate that creator has the required token amount
    try {
      const tokenAccountInfo = await getAccount(this.connection, creatorTokenAccount, undefined, tokenProgramId);
      if (tokenAccountInfo.amount < BigInt(params.initialSupply.toString())) {
        throw new Error(`Insufficient token balance. Required: ${params.initialSupply.toString()}, Available: ${tokenAccountInfo.amount.toString()}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenAccountNotFoundError') {
        throw new Error('Creator token account not found. Please create an associated token account first.');
      }
      throw error;
    }

    // Build the program params structure
    const programParams = {
      initialSupply: params.initialSupply,
      virtualTokenReserves: params.virtualTokenReserves,
      virtualSolReserves: params.virtualSolReserves,
    };

    // Build the complete accounts object as expected by the program
    const accounts = {
      bondingCurve,
      curveTokenAccount,
      creatorTokenAccount,
      mint: params.tokenMint,
      creator: signerPubkey,
      globalConfig,
      tokenProgram: tokenProgramId,
      associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
      systemProgram: SystemProgram.programId,
      rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
    };

    if (signer && isWalletAdapter(signer)) {
      const instruction = await this.program.methods
        .createBondingCurve(programParams)
        .accounts(accounts)
        .instruction();

      const transaction = new Transaction().add(instruction);
      return await sendTransaction(this.connection, transaction, signer, options);
    } else {
      const keypairSigner = signer as Keypair || (this.wallet as any).payer;
      return await this.program.methods
        .createBondingCurve(programParams)
        .accounts(accounts)
        .signers([keypairSigner])
        .rpc();
    }
  }

  /**
   * Buy tokens with SOL - fully aligned with program's buy instruction
   */
  async buy(
    params: BuyParams,
    signer?: SignerType,
    additionalHookAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [],
    options?: SendTransactionOptions
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const bondingCurveData = await this.getBondingCurve(params.bondingCurve);
    const [curveTokenAccount] = getCurveTokenAccountPDA(params.bondingCurve, bondingCurveData.mint);

    const signerPubkey = signer ? getSignerPublicKey(signer) : this.wallet.publicKey;
    const tokenProgramId = await getTokenProgramId(this.connection, bondingCurveData.mint);
    
    const userTokenAccount = await getAssociatedTokenAddress(
      bondingCurveData.mint,
      signerPubkey,
      false,
      tokenProgramId
    );

    // Get global config to access fee recipient
    const globalConfigData = await this.getGlobalConfig();

    const instructions = [];

    // Create associated token account if it doesn't exist
    const userTokenAccountInfo = await this.connection.getAccountInfo(userTokenAccount);
    if (!userTokenAccountInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          signerPubkey, // payer
          userTokenAccount,
          signerPubkey, // owner
          bondingCurveData.mint,
          tokenProgramId
        )
      );
    }

    // Automatically get transfer hook accounts for Token-2022
    const transferHookAccounts = await getTransferHookAccounts(
      this.connection,
      bondingCurveData.mint,
      curveTokenAccount,
      userTokenAccount,
      signerPubkey,
      BigInt(params.solAmount.toString())
    );

    // Combine hook accounts
    const allHookAccounts = [...transferHookAccounts, ...additionalHookAccounts];

    // Build buy instruction with exact program account structure
    const buyAccounts = {
      bondingCurve: params.bondingCurve,
      curveTokenAccount,
      userTokenAccount,
      user: signerPubkey,
      mint: bondingCurveData.mint,
      globalConfig,
      feeRecipient: globalConfigData.feeRecipient,
      tokenProgram: tokenProgramId,
      associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
      systemProgram: SystemProgram.programId,
      rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
    };

    const buyInstruction = await this.program.methods
      .buy(params.solAmount, params.minTokenAmount)
      .accounts(buyAccounts)
      .remainingAccounts(allHookAccounts) // For transfer hooks
      .instruction();

    instructions.push(buyInstruction);

    if (signer && isWalletAdapter(signer)) {
      const transaction = new Transaction().add(...instructions);
      return await sendTransaction(this.connection, transaction, signer, options);
    } else {
      // For keypairs, use direct transaction sending for better control
      const keypairSigner = signer as Keypair || (this.wallet as any).payer;
      const transaction = new Transaction().add(...instructions);
      
      // Set recent blockhash and fee payer
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypairSigner.publicKey;
      
      // Sign and send
      transaction.sign(keypairSigner);
      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      await this.connection.confirmTransaction(signature);
      return signature;
    }
  }

  /**
   * Sell tokens for SOL - fully aligned with program's sell instruction
   */
  async sell(
    params: SellParams,
    signer?: SignerType,
    additionalHookAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = [],
    options?: SendTransactionOptions
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const bondingCurveData = await this.getBondingCurve(params.bondingCurve);
    const [curveTokenAccount] = getCurveTokenAccountPDA(params.bondingCurve, bondingCurveData.mint);

    const signerPubkey = signer ? getSignerPublicKey(signer) : this.wallet.publicKey;
    const tokenProgramId = await getTokenProgramId(this.connection, bondingCurveData.mint);
    
    const userTokenAccount = await getAssociatedTokenAddress(
      bondingCurveData.mint,
      signerPubkey,
      false,
      tokenProgramId
    );

    // Get global config to access fee recipient
    const globalConfigData = await this.getGlobalConfig();

    // Get transfer hook accounts for Token-2022
    const transferHookAccounts = await getTransferHookAccounts(
      this.connection,
      bondingCurveData.mint,
      userTokenAccount, // from (user selling tokens)
      curveTokenAccount, // to (curve receiving tokens)
      signerPubkey,
      BigInt(params.tokenAmount.toString())
    );

    const allHookAccounts = [...transferHookAccounts, ...additionalHookAccounts];

    // Build sell instruction with exact program account structure
    const sellAccounts = {
      bondingCurve: params.bondingCurve,
      curveTokenAccount,
      userTokenAccount,
      user: signerPubkey,
      mint: bondingCurveData.mint,
      globalConfig,
      feeRecipient: globalConfigData.feeRecipient,
      tokenProgram: tokenProgramId,
      associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
      systemProgram: SystemProgram.programId,
      rent: new PublicKey('SysvarRent111111111111111111111111111111111'),
    };

    if (signer && isWalletAdapter(signer)) {
      const instruction = await this.program.methods
        .sell(params.tokenAmount, params.minSolAmount)
        .accounts(sellAccounts)
        .remainingAccounts(allHookAccounts)
        .instruction();

      const transaction = new Transaction().add(instruction);
      return await sendTransaction(this.connection, transaction, signer, options);
    } else {
      const keypairSigner = signer as Keypair || (this.wallet as any).payer;
      return await this.program.methods
        .sell(params.tokenAmount, params.minSolAmount)
        .accounts(sellAccounts)
        .remainingAccounts(allHookAccounts)
        .signers([keypairSigner])
        .rpc();
    }
  }

  /**
   * Get buy quote with accurate fee calculation matching the program
   */
  async getBuyQuote(bondingCurve: PublicKey, solAmount: BN): Promise<PriceQuote> {
    const curve = await this.getBondingCurve(bondingCurve);
    
    // Apply fee calculation (matches program logic exactly)
    const FEE_BASIS_POINTS = 100; // 1%
    const feeAmount = solAmount.mul(new BN(FEE_BASIS_POINTS)).div(new BN(10000));
    const solAmountAfterFee = solAmount.sub(feeAmount);
    
    // Calculate using program's exact reserve formula
    const totalSolReserves = curve.virtualSolReserves.add(curve.realSolReserves);
    const totalTokenReserves = curve.virtualTokenReserves.sub(curve.realTokenReserves);
    
    const { tokenAmount } = calculateBuyAmount(
      solAmountAfterFee,
      totalSolReserves,
      totalTokenReserves,
      curve.realSolReserves,
      curve.realTokenReserves
    );

    const pricePerToken = calculateTokenPrice(
      totalSolReserves,
      totalTokenReserves,
      curve.realSolReserves,
      curve.realTokenReserves
    );

    const priceImpact = calculatePriceImpact(
      solAmountAfterFee,
      tokenAmount,
      totalSolReserves,
      totalTokenReserves
    );

    return {
      tokenAmount,
      solAmount,
      fee: feeAmount,
      pricePerToken,
      priceImpact
    };
  }

  /**
   * Get sell quote with accurate fee calculation matching the program
   */
  async getSellQuote(bondingCurve: PublicKey, tokenAmount: BN): Promise<PriceQuote> {
    const curve = await this.getBondingCurve(bondingCurve);
    
    // Calculate using program's exact reserve formula
    const totalSolReserves = curve.virtualSolReserves.add(curve.realSolReserves);
    const totalTokenReserves = curve.virtualTokenReserves.sub(curve.realTokenReserves);
    
    const { solAmount } = calculateSellAmount(
      tokenAmount,
      totalTokenReserves,
      totalSolReserves,
      curve.realTokenReserves,
      curve.realSolReserves
    );

    // Apply fee (fee is taken from SOL amount in sell)
    const FEE_BASIS_POINTS = 100; // 1%
    const feeAmount = solAmount.mul(new BN(FEE_BASIS_POINTS)).div(new BN(10000));
    const solAmountAfterFee = solAmount.sub(feeAmount);

    const pricePerToken = calculateTokenPrice(
      totalSolReserves,
      totalTokenReserves,
      curve.realSolReserves,
      curve.realTokenReserves
    );

    const priceImpact = calculatePriceImpact(
      tokenAmount,
      solAmountAfterFee,
      totalTokenReserves,
      totalSolReserves
    );

    return {
      tokenAmount,
      solAmount: solAmountAfterFee,
      fee: feeAmount,
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