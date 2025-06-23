import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from '@solana/web3.js';
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
  SwapResult
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
  hasTransferHooks
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
    this.program = new Program(programIdl, PROGRAM_ID, this.provider);
  }

  // Initialize global configuration
  async initializeGlobalConfig(
    authority: PublicKey,
    feeRecipient: PublicKey,
    authorityKeypair: Keypair
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();

    const tx = await this.program.methods
      .initializeGlobalConfig(authority, feeRecipient)
      .accounts({
        globalConfig,
        authority: authorityKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authorityKeypair])
      .rpc();

    return tx;
  }

  // Create a new bonding curve
  async createBondingCurve(
    params: CreateBondingCurveParams,
    creatorKeypair: Keypair
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const [bondingCurve] = getBondingCurvePDA(params.tokenMint);
    const [curveTokenAccount] = getCurveTokenAccountPDA(bondingCurve, params.tokenMint);

    const tokenProgramId = await getTokenProgramId(this.connection, params.tokenMint);
    const creatorTokenAccount = await getAssociatedTokenAddress(
      params.tokenMint,
      creatorKeypair.publicKey,
      false,
      tokenProgramId
    );

    const tx = await this.program.methods
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
        creator: creatorKeypair.publicKey,
        tokenProgram: tokenProgramId,
        systemProgram: SystemProgram.programId,
      })
      .signers([creatorKeypair])
      .rpc();

    return tx;
  }

  // Buy tokens with SOL (automatically handles transfer hooks)
  async buy(
    params: BuyParams,
    userKeypair: Keypair,
    additionalHookAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = []
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const bondingCurveData = await this.getBondingCurve(params.bondingCurve);
    const [curveTokenAccount] = getCurveTokenAccountPDA(params.bondingCurve, bondingCurveData.mint);

    const tokenProgramId = await getTokenProgramId(this.connection, bondingCurveData.mint);
    const userTokenAccount = await getAssociatedTokenAddress(
      bondingCurveData.mint,
      userKeypair.publicKey,
      false,
      tokenProgramId
    );

    // Create associated token account if it doesn't exist
    const userTokenAccountInfo = await this.connection.getAccountInfo(userTokenAccount);
    const instructions = [];
    if (!userTokenAccountInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          userKeypair.publicKey,
          userTokenAccount,
          userKeypair.publicKey,
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
      userKeypair.publicKey,
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
        user: userKeypair.publicKey,
        feeRecipient: (await this.getGlobalConfig()).feeRecipient,
        tokenProgram: tokenProgramId,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(allHookAccounts)
      .instruction();

    instructions.push(buyInstruction);

    const tx = new Transaction().add(...instructions);
    const signature = await this.connection.sendTransaction(tx, [userKeypair]);
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  // Sell tokens for SOL (automatically handles transfer hooks)
  async sell(
    params: SellParams,
    userKeypair: Keypair,
    additionalHookAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] = []
  ): Promise<string> {
    const [globalConfig] = getGlobalConfigPDA();
    const bondingCurveData = await this.getBondingCurve(params.bondingCurve);
    const [curveTokenAccount] = getCurveTokenAccountPDA(params.bondingCurve, bondingCurveData.mint);

    const tokenProgramId = await getTokenProgramId(this.connection, bondingCurveData.mint);
    const userTokenAccount = await getAssociatedTokenAddress(
      bondingCurveData.mint,
      userKeypair.publicKey,
      false,
      tokenProgramId
    );

    // Automatically get transfer hook accounts
    const transferHookAccounts = await getTransferHookAccounts(
      this.connection,
      bondingCurveData.mint,
      userTokenAccount,
      curveTokenAccount,
      userKeypair.publicKey,
      BigInt(params.tokenAmount.toString())
    );

    // Combine automatic and additional hook accounts
    const allHookAccounts = [...transferHookAccounts, ...additionalHookAccounts];

    const tx = await this.program.methods
      .sell(params.tokenAmount, params.minSolAmount)
      .accounts({
        globalConfig,
        bondingCurve: params.bondingCurve,
        mint: bondingCurveData.mint,
        curveTokenAccount,
        userTokenAccount,
        user: userKeypair.publicKey,
        feeRecipient: (await this.getGlobalConfig()).feeRecipient,
        tokenProgram: tokenProgramId,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(allHookAccounts)
      .signers([userKeypair])
      .rpc();

    return tx;
  }

  // Get quote for buying tokens
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

  // Get quote for selling tokens
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
    return await this.program.account.globalConfig.fetch(globalConfigPDA);
  }

  // Get bonding curve data
  async getBondingCurve(bondingCurve: PublicKey): Promise<BondingCurve> {
    return await this.program.account.bondingCurve.fetch(bondingCurve);
  }

  // Get all bonding curves
  async getAllBondingCurves(): Promise<{ publicKey: PublicKey; account: BondingCurve }[]> {
    return await this.program.account.bondingCurve.all();
  }

  // Get bonding curves by creator
  async getBondingCurvesByCreator(creator: PublicKey): Promise<{ publicKey: PublicKey; account: BondingCurve }[]> {
    return await this.program.account.bondingCurve.all([
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