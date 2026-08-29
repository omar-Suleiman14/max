export const accountTypes = ['cash', 'bank', 'wallet', 'other'] as const;
export type AccountType = (typeof accountTypes)[number];

export type AccountDraft = Readonly<{
  accountType: AccountType;
  initialBalance: number;
  name: string;
}>;

export type AccountDefinition = AccountDraft & Readonly<{
  balance: number;
  createdAt: string;
  id: string;
  position: number;
  updatedAt: string;
}>;
