export const accountTypes = ['cash', 'bank', 'wallet', 'other'] as const;
export type AccountType = (typeof accountTypes)[number];

export const feeTypes = ['none', 'fixed', 'percentage', 'fixed_plus_percentage'] as const;
export type FeeType = (typeof feeTypes)[number];

export type FeeConfig = Readonly<{
  feeType: FeeType;
  fixedAmount?: number;
  maxFee?: number;
  minFee?: number;
  percentage?: number;
}>;

export type AccountDraft = Readonly<{
  accountType: AccountType;
  feeConfig?: FeeConfig;
  initialBalance: number;
  name: string;
  providerId?: string;
}>;

export type AccountDefinition = AccountDraft & Readonly<{
  balance: number;
  createdAt: string;
  id: string;
  position: number;
  updatedAt: string;
}>;

/** Calculate the provider fee for a given amount using an account's fee config. */
export function calculateFee(amount: number, config?: FeeConfig): number {
  if (!config || config.feeType === 'none') return 0;
  let fee = 0;
  if (config.feeType === 'fixed') {
    fee = config.fixedAmount ?? 0;
  } else if (config.feeType === 'percentage') {
    fee = amount * ((config.percentage ?? 0) / 100);
  } else if (config.feeType === 'fixed_plus_percentage') {
    fee = (config.fixedAmount ?? 0) + amount * ((config.percentage ?? 0) / 100);
  }
  if (config.minFee !== undefined && fee < config.minFee) fee = config.minFee;
  if (config.maxFee !== undefined && fee > config.maxFee) fee = config.maxFee;
  return Math.round(fee * 100) / 100;
}
