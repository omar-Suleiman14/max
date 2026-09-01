export type PaymentMode = 'full' | 'partial' | 'later';

export type PriceSuggestionSource = 'historical-last' | 'item-price' | 'none' | 'template-default';

export type QuickEntryPriceSuggestion = Readonly<{
  amount: number | null;
  lastAccountId?: string;
  source: PriceSuggestionSource;
}>;

export type OperationKind =
  | 'sale'
  | 'purchase'
  | 'expense'
  | 'income'
  | 'transfer'
  | 'adjustment'
  | 'reconciliation';

export type QuickEntryDraft = Readonly<{
  accountId?: string;
  adjustmentDirection?: 'inflow' | 'outflow';
  collectorId?: string;
  itemId?: string;
  note?: string;
  operationKind: OperationKind;
  paidAmount?: number;
  paymentMode: PaymentMode;
  personId?: string;
  pricingCustomerType?: string;
  pricingInputMode?: 'customer_pays' | 'customer_receives';
  pricingOverrides?: readonly PricingOverride[];
  pricingProfileId?: string;
  pricingServiceId?: string;
  providerCost?: number;
  providerFee?: number;
  quantity?: number;
  serviceFee?: number;
  templateId?: string;
  toAccountId?: string;
  totalAmount: number;
}>;
import type { PricingOverride } from './pricing-contract';
