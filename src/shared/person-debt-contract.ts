import type { TransactionRecord } from './transaction-contract';

export type PersonBalanceSummary = Readonly<{
  lastActivity?: string;
  netBalance: number;
  payable: number;
  personId: string;
  personLabel: string;
  receivable: number;
}>;

export type PersonFinancialStatement = Readonly<{
  history: readonly TransactionRecord[];
  summary: PersonBalanceSummary;
  unpaidTransactions: readonly TransactionRecord[];
}>;

export type RepaymentDraft = Readonly<{
  accountId: string;
  amount: number;
  note?: string;
  personId: string;
}>;

export type ForgivenessDraft = Readonly<{
  amount: number;
  personId: string;
  reason: string;
}>;
