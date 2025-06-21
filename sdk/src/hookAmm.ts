import { 
  Connection, 
  PublicKey, 
  Transaction,
  TransactionInstruction,
  Keypair,
  Signer,
  AccountInfo,
  Commitment,
  ConfirmOptions,
  SendOptions
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import BN from 'bn.js';
import { 
  GlobalConfig, 
  BondingCurve, 
  CreateBondingCurveParams,
  BuyParams,
  SellParams,
  TradeEvent,
  PriceCalculation
} from './types';
import { 
  getPDAs, 
  getUserTokenAccount, 
  calculatePrice,
  calculateFee,
  calculateBuyAmount,
  calculateSellAmount,
  calculateMinimumReceived
} from './utils';
import { HOOK_AMM_PROGRAM_ID } from './constants';
import { parseError, HookAmmSDKError } from './errors';

export class HookAmm {
  private program: Program;
  private connection: Connection;
  private programId: PublicKey;

  constructor(
    connection: Connection,
    programId: PublicKey = HOOK_AMM_PROGRAM_ID,
    idl?: Idl,
    options?: {
      commitment?: Commitment;
    }
  ) {
    this.connection = connection;
    this.programId = programId;
    
    // Initialize program
    const provider = new AnchorProvider(
      connection,
      {} as any, // Wallet will be provided per transaction
      { commitment: options?.commitment || 'confirmed' }
    );
    
    // Use provided IDL or try to import the embedded one
    if (!idl) {
      try {
        // Try to use the embedded IDL
        const { IDL } = require('./idl');
        idl = IDL;
      } catch (error) {
        throw new HookAmmSDKError('IDL must be provided or embedded IDL not found');
      }
    }
    
    this.program = new Program(idl, programId, provider);
  }

  /**
   * Initialize global configuration
   */
  async initializeGlobalConfig(
    authority: Keypair,
    feeRecipient: PublicKey,
    options?: ConfirmOptions
  ): Promise<string> {
    try {
      const { globalConfig } = getPDAs(this.programId);
      
      const tx = await this.program.methods
        .initializeGlobalConfig()
        .accounts({
          globalConfig,
          authority: authority.publicKey,
          feeRecipient,
          systemProgram: PublicKey.default,
        })
        .signers([authority])
        .rpc(options);
      
      return tx;
    } catch (error) {
      throw new HookAmmSDKError(parseError(error));
    }
  }

  /**
   * Create a new bonding curve
   */
  async createBondingCurve(
    creator: Keypair,
    mint: PublicKey,
    params: CreateBondingCurveParams,
    tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
    options?: ConfirmOptions
  ): Promise<string> {
    try {
      const { globalConfig, bondingCurve, curveTokenAccount } = getPDAs(this.programId, mint);
      
      const tx = await this.program.methods
        .createBondingCurve(params)
        .accounts({
          bondingCurve,
          curveTokenAccount,
          mint,
          creator: creator.publicKey,
          globalConfig,
          tokenProgram: tokenProgramId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: PublicKey.default,
          rent: PublicKey.default,
        })
        .signers([creator])
        .rpc(options);
      
      return tx;
    } catch (error) {
      throw new HookAmmSDKError(parseError(error));
    }
  }

  /**
   * Buy tokens from bonding curve
   */
  async buy(
    buyer: Keypair,
    mint: PublicKey,
    params: BuyParams,
    tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
    remainingAccounts: AccountInfo<Buffer>[] = [],
    options?: ConfirmOptions
  ): Promise<string> {
    try {
      const { globalConfig, bondingCurve, curveTokenAccount } = getPDAs(this.programId, mint);
      const userTokenAccount = await getUserTokenAccount(mint, buyer.publicKey, false, tokenProgramId);
      
      // Get fee recipient from global config
      const globalConfigAccount = await this.getGlobalConfig();
      const feeRecipient = globalConfigAccount.feeRecipient;
      
      const tx = await this.program.methods
        .buy(params.solAmount, params.minTokenAmount)
        .accounts({
          bondingCurve,
          curveTokenAccount,
          userTokenAccount,
          user: buyer.publicKey,
          mint,
          globalConfig,
          feeRecipient,
          tokenProgram: tokenProgramId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: PublicKey.default,
          rent: PublicKey.default,
        })
        .remainingAccounts(remainingAccounts)
        .signers([buyer])
        .rpc(options);
      
      return tx;
    } catch (error) {
      throw new HookAmmSDKError(parseError(error));
    }
  }

  /**
   * Sell tokens to bonding curve
   */
  async sell(
    seller: Keypair,
    mint: PublicKey,
    params: SellParams,
    tokenProgramId: PublicKey = TOKEN_PROGRAM_ID,
    remainingAccounts: AccountInfo<Buffer>[] = [],
    options?: ConfirmOptions
  ): Promise<string> {
    try {
      const { globalConfig, bondingCurve, curveTokenAccount } = getPDAs(this.programId, mint);
      const userTokenAccount = await getUserTokenAccount(mint, seller.publicKey, false, tokenProgramId);
      
      // Get fee recipient from global config
      const globalConfigAccount = await this.getGlobalConfig();
      const feeRecipient = globalConfigAccount.feeRecipient;
      
      const tx = await this.program.methods
        .sell(params.tokenAmount, params.minSolAmount)
        .accounts({
          bondingCurve,
          curveTokenAccount,
          userTokenAccount,
          user: seller.publicKey,
          mint,
          globalConfig,
          feeRecipient,
          tokenProgram: tokenProgramId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: PublicKey.default,
          rent: PublicKey.default,
        })
        .remainingAccounts(remainingAccounts)
        .signers([seller])
        .rpc(options);
      
      return tx;
    } catch (error) {
      throw new HookAmmSDKError(parseError(error));
    }
  }

  /**
   * Get global configuration
   */
  async getGlobalConfig(): Promise<GlobalConfig> {
    const { globalConfig } = getPDAs(this.programId);
    return this.program.account.globalConfig.fetch(globalConfig);
  }

  /**
   * Get bonding curve data
   */
  async getBondingCurve(mint: PublicKey): Promise<BondingCurve | null> {
    try {
      const { bondingCurve } = getPDAs(this.programId, mint);
      return await this.program.account.bondingCurve.fetch(bondingCurve);
    } catch {
      return null;
    }
  }

  /**
   * Get all bonding curves
   */
  async getAllBondingCurves(): Promise<Array<{ publicKey: PublicKey; account: BondingCurve }>> {
    return this.program.account.bondingCurve.all();
  }

  /**
   * Get bonding curves by creator
   */
  async getBondingCurvesByCreator(creator: PublicKey): Promise<Array<{ publicKey: PublicKey; account: BondingCurve }>> {
    return this.program.account.bondingCurve.all([
      {
        memcmp: {
          offset: 8 + 32, // After discriminator + mint
          bytes: creator.toBase58(),
        },
      },
    ]);
  }

  /**
   * Calculate current price and market metrics
   */
  async getPrice(mint: PublicKey): Promise<PriceCalculation | null> {
    const bondingCurve = await this.getBondingCurve(mint);
    if (!bondingCurve) return null;
    
    return calculatePrice(bondingCurve);
  }

  /**
   * Simulate buy transaction
   */
  async simulateBuy(
    mint: PublicKey,
    solAmount: BN
  ): Promise<{ tokenAmount: BN; fee: BN; priceImpact: number }> {
    const bondingCurve = await this.getBondingCurve(mint);
    if (!bondingCurve) {
      throw new HookAmmSDKError('Bonding curve not found');
    }
    
    const fee = calculateFee(solAmount);
    const amountAfterFee = solAmount.sub(fee);
    
    const tokenAmount = calculateBuyAmount(
      amountAfterFee,
      bondingCurve.virtualSolReserves.add(bondingCurve.realSolReserves),
      bondingCurve.virtualTokenReserves.sub(bondingCurve.realTokenReserves)
    );
    
    // Calculate price impact
    const currentPrice = calculatePrice(bondingCurve);
    const simulatedCurve = { ...bondingCurve };
    simulatedCurve.realSolReserves = bondingCurve.realSolReserves.add(amountAfterFee);
    simulatedCurve.realTokenReserves = bondingCurve.realTokenReserves.add(tokenAmount);
    const newPrice = calculatePrice(simulatedCurve);
    
    const priceImpact = ((newPrice.price - currentPrice.price) / currentPrice.price) * 100;
    
    return {
      tokenAmount,
      fee,
      priceImpact: Math.abs(priceImpact)
    };
  }

  /**
   * Simulate sell transaction
   */
  async simulateSell(
    mint: PublicKey,
    tokenAmount: BN
  ): Promise<{ solAmount: BN; fee: BN; priceImpact: number }> {
    const bondingCurve = await this.getBondingCurve(mint);
    if (!bondingCurve) {
      throw new HookAmmSDKError('Bonding curve not found');
    }
    
    const solAmount = calculateSellAmount(
      tokenAmount,
      bondingCurve.virtualTokenReserves.sub(bondingCurve.realTokenReserves),
      bondingCurve.virtualSolReserves.add(bondingCurve.realSolReserves)
    );
    
    const fee = calculateFee(solAmount);
    const amountAfterFee = solAmount.sub(fee);
    
    // Calculate price impact
    const currentPrice = calculatePrice(bondingCurve);
    const simulatedCurve = { ...bondingCurve };
    simulatedCurve.realSolReserves = bondingCurve.realSolReserves.sub(solAmount);
    simulatedCurve.realTokenReserves = bondingCurve.realTokenReserves.sub(tokenAmount);
    const newPrice = calculatePrice(simulatedCurve);
    
    const priceImpact = ((newPrice.price - currentPrice.price) / currentPrice.price) * 100;
    
    return {
      solAmount: amountAfterFee,
      fee,
      priceImpact: Math.abs(priceImpact)
    };
  }

  /**
   * Create associated token account if needed
   */
  async createTokenAccountIfNeeded(
    mint: PublicKey,
    owner: PublicKey,
    payer: Keypair,
    tokenProgramId: PublicKey = TOKEN_PROGRAM_ID
  ): Promise<PublicKey> {
    const tokenAccount = await getUserTokenAccount(mint, owner, false, tokenProgramId);
    
    const accountInfo = await this.connection.getAccountInfo(tokenAccount);
    if (!accountInfo) {
      const ix = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        tokenAccount,
        owner,
        mint,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      
      const tx = new Transaction().add(ix);
      await this.connection.sendTransaction(tx, [payer]);
    }
    
    return tokenAccount;
  }

  /**
   * Listen to trade events
   */
  onTradeEvent(callback: (event: TradeEvent) => void): number {
    return this.program.addEventListener('TradeEvent', callback);
  }

  /**
   * Remove event listener
   */
  async removeEventListener(listenerId: number): Promise<void> {
    await this.program.removeEventListener(listenerId);
  }

  /**
   * Get program ID
   */
  getProgramId(): PublicKey {
    return this.programId;
  }
}