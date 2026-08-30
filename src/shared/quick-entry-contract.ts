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
  | 'reconciliation';

export type QuickEntryDraft = Readonly<{
  accountId?: string;
  collectorId?: string;
  itemId?: string;
  note?: string;
  operationKind: OperationKind;
  paidAmount?: number;
  paymentMode: PaymentMode;
  personId?: string;
  providerFee?: number;
  quantity?: number;
  serviceFee?: number;
  templateId?: string;
  toAccountId?: string;
  totalAmount: number;
}>;
