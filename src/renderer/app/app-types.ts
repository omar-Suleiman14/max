/** Landing page shown when the workspace has no pages or databases yet. */
export const EMPTY_WORKSPACE_PAGE = 'workspace-empty';

import type { LucideIcon } from 'lucide-react';
import type { NotionBlock } from '../ui/notion-block-editor';
import type { PageProperty } from '../pages/page-properties';

export type AppPage =
  | 'accounts'
  | 'databases'
  | 'items'
  | 'people'
  | 'reconciliation'
  | 'settings'
  | 'transactions'
  | (string & {});

export type CustomPage = Readonly<{
  properties?: readonly PageProperty[];
  blocks: readonly NotionBlock[];
  createdAt: string;
  icon: string;
  id: string;
  favorite?: boolean;
  parentNodeId?: string | null;
  positionKey?: string;
  title: string;
  updatedAt: string;
  wiki?: boolean;
}>;

export type NavigationItem = Readonly<{
  icon: LucideIcon;
  page: AppPage;
}>;

export type EngineStatus = 'checking' | 'ready' | 'unavailable';

export type SettingsSectionId =
  | 'settings-general'
  | 'settings-quick-actions'
  | 'settings-appearance'
  | 'settings-backup'
  | 'settings-archive'
  | 'settings-danger';
