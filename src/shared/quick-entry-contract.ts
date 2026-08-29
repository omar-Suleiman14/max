export type PaymentMode = 'full' | 'partial' | 'later';

export type PriceSuggestionSource = 'historical-last' | 'item-price' | 'none' | 'template-default';

export type QuickEntryPriceSuggestion = Readonly<{
  amount: number | null;
  lastAccountId?: string;
  source: PriceSuggestionSource;
}>;

export type QuickEntryDraft = Readonly<{
  accountId?: string;
  collectorId?: string;
  itemId?: string;
  note?: string;
  paidAmount?: number;
  paymentMode: PaymentMode;
  personId?: string;
  templateId?: string;
  totalAmount: number;
}>;
