export const transactionTypes = [
  'sale',
  'purchase',
  'expense',
  'transfer',
  'income',
  'adjustment',
  'reversal',
] as const;
export type TransactionType = (typeof transactionTypes)[number];

export const paymentStatuses = ['paid', 'partial', 'unpaid'] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const movementTypes = ['inflow', 'outflow'] as const;
export type MovementType = (typeof movementTypes)[number];

export type MoneyMovementDraft = Readonly<{
  accountId: string;
  amount: number;
  movementType: MovementType;
}>;

export type MoneyMovement = MoneyMovementDraft & Readonly<{
  accountName?: string;
  createdAt: string;
  id: number;
  transactionId: string;
}>;

export type TransactionDraft = Readonly<{
  itemId?: string;
  movements: readonly MoneyMovementDraft[];
  note?: string;
  paidAmount: number;
  personId?: string;
  pricing?: TransactionPricing;
  providerFee?: number;
  quantity?: number;
  serviceFee?: number;
  totalAmount: number;
  transactionType: TransactionType;
}>;

export type TransactionPricing = PricingAmounts & Readonly<{
  overrides: readonly PricingOverride[];
  profileId: string;
  serviceId?: string;
  snapshot: PricingSnapshot;
}>;

export type TransferDraft = Readonly<{
  amount: number;
  fromAccountId: string;
  note?: string;
  pricing?: TransactionPricing;
  providerFee?: number;
  serviceFee?: number;
  toAccountId: string;
}>;

export type TransactionRecord = Readonly<{
  createdAt: string;
  id: string;
  itemId?: string;
  itemLabel?: string;
  movements: readonly MoneyMovement[];
  note?: string;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  personId?: string;
  personLabel?: string;
  pricing?: TransactionPricing;
  providerFee?: number;
  quantity?: number;
  reversalOfId?: string;
  reversedAt?: string;
  serviceFee?: number;
  totalAmount: number;
  transactionType: TransactionType;
  updatedAt: string;
}>;

export type LedgerSummary = Readonly<{
  totalBank: number;
  totalCash: number;
  totalExpenses: number;
  totalOverall: number;
  totalSales: number;
  totalWallet: number;
}>;
import type { PricingAmounts, PricingOverride, PricingSnapshot } from './pricing-contract';
