import type { ObjectKind } from './object-contract';

export type ViewTargetKind = ObjectKind | 'account' | 'transaction';

export type ViewFilterRule = Readonly<{
  field: string;
  operator: 'contains' | 'equals' | 'greater-than' | 'is-empty' | 'is-not-empty' | 'less-than';
  value?: unknown;
}>;

export type ViewSortRule = Readonly<{
  direction: 'asc' | 'desc';
  field: string;
}>;

export type SavedView = Readonly<{
  createdAt: string;
  filterRules: readonly ViewFilterRule[];
  groupByPropertyId?: string;
  id: string;
  name: string;
  position: number;
  sortRules: readonly ViewSortRule[];
  targetKind: ViewTargetKind;
  updatedAt: string;
}>;

export type SavedViewDraft = Readonly<{
  filterRules?: readonly ViewFilterRule[];
  groupByPropertyId?: string;
  name: string;
  position?: number;
  sortRules?: readonly ViewSortRule[];
  targetKind: ViewTargetKind;
}>;

export type CustomPage = Readonly<{
  createdAt: string;
  icon?: string;
  id: string;
  layoutJson: string;
  name: string;
  position: number;
  updatedAt: string;
}>;

export type CustomPageDraft = Readonly<{
  icon?: string;
  layoutJson: string;
  name: string;
  position?: number;
}>;

export type SearchResultKind = 'account' | 'item' | 'page' | 'person' | 'transaction' | 'view';

export type SearchResult = Readonly<{
  id: string;
  kind: SearchResultKind;
  matchScore: number;
  metadata?: string;
  subtitle?: string;
  title: string;
}>;
