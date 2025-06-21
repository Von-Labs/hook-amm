export enum HookAmmError {
  InvalidAmount = 6000,
  SlippageExceeded = 6001,
  CurveComplete = 6002,
  InsufficientReserves = 6003,
  Overflow = 6004,
}

export class HookAmmSDKError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = 'HookAmmSDKError';
  }
}

export function parseError(error: any): string {
  if (error.code !== undefined) {
    switch (error.code) {
      case HookAmmError.InvalidAmount:
        return 'Invalid amount provided';
      case HookAmmError.SlippageExceeded:
        return 'Slippage tolerance exceeded';
      case HookAmmError.CurveComplete:
        return 'Bonding curve is already complete';
      case HookAmmError.InsufficientReserves:
        return 'Insufficient reserves for this operation';
      case HookAmmError.Overflow:
        return 'Numerical overflow in calculation';
      default:
        return `Unknown error: ${error.code}`;
    }
  }
  return error.message || 'Unknown error occurred';
}