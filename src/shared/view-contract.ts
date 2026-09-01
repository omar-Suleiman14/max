/**
 * Workspace views and layout state contracts for Max v0.2.0.
 */

import type { FilterNode, GroupRule, SortRule } from './query-contract';

export type ViewLayout =
  | 'table'
  | 'list'
  | 'board'
  | 'calendar'
  | 'gallery'
  | 'timeline'
  | 'chart'
  | 'map'
  | 'form';

export type ColumnState = Readonly<{
  hidden?: boolean;
  propertyId: string;
  width?: number;
  wrap?: boolean;
}>;

export type PropertyViewState = Readonly<{
  columns: readonly ColumnState[];
  coverPropertyId?: string | null;
  datePropertyId?: string | null;
  groupPropertyId?: string | null;
}>;

export type WorkspaceView = Readonly<{
  archivedAt?: string | null;
  createdAt: string;
  databaseId: string;
  filterAst: FilterNode | null;
  group?: GroupRule | null;
  id: string;
  layout: ViewLayout;
  layoutConfig: Readonly<Record<string, unknown>>;
  name: string;
  ownerId: string;
  ownerType: 'database' | 'block';
  positionKey: string;
  propertyState: PropertyViewState;
  sorts: readonly SortRule[];
  updatedAt: string;
}>;

export type WorkspaceViewDraft = Readonly<{
  databaseId: string;
  filterAst?: FilterNode | null;
  group?: GroupRule | null;
  id?: string;
  layout?: ViewLayout;
  layoutConfig?: Readonly<Record<string, unknown>>;
  name: string;
  ownerId?: string;
  ownerType?: 'database' | 'block';
  positionKey?: string;
  propertyState?: PropertyViewState;
  sorts?: readonly SortRule[];
}>;

export type WorkspaceViewPatch = Readonly<{
  filterAst?: FilterNode | null;
  group?: GroupRule | null;
  layout?: ViewLayout;
  layoutConfig?: Readonly<Record<string, unknown>>;
  name?: string;
  positionKey?: string;
  propertyState?: PropertyViewState;
  sorts?: readonly SortRule[];
}>;
