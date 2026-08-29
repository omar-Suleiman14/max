export type DailySessionStatus = 'closed' | 'open';

export type DailySession = Readonly<{
  accountId: string;
  actualClosingBalance?: number;
  closedAt?: string;
  createdAt: string;
  discrepancy?: number;
  discrepancyNote?: string;
  expectedClosingBalance?: number;
  id: string;
  openedAt: string;
  openingBalance: number;
  reconciliationTransactionId?: string;
  status: DailySessionStatus;
  totalExpenses: number;
  totalInflows: number;
  totalOutflows: number;
  totalSales: number;
  updatedAt: string;
}>;

export type OpenSessionDraft = Readonly<{
  accountId: string;
  openingBalance: number;
}>;

export type CloseSessionDraft = Readonly<{
  actualClosingBalance: number;
  discrepancyNote?: string;
  sessionId: string;
}>;

export type SessionExpectedClosing = Readonly<{
  expectedBalance: number;
  netMovement: number;
  openingBalance: number;
  sessionId: string;
  totalExpenses: number;
  totalInflows: number;
  totalOutflows: number;
  totalSales: number;
}>;
