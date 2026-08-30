import type { LucideIcon } from 'lucide-react';
import type { NotionBlock } from '../ui/notion-block-editor';

export type AppPage =
  | 'accounts'
  | 'databases'
  | 'home'
  | 'items'
  | 'people'
  | 'reconciliation'
  | 'settings'
  | 'transactions'
  | (string & {});

export type CustomPage = Readonly<{
  blocks: readonly NotionBlock[];
  createdAt: string;
  icon: string;
  id: string;
  title: string;
  updatedAt: string;
}>;

export type NavigationItem = Readonly<{
  icon: LucideIcon;
  page: AppPage;
}>;

export type EngineStatus = 'checking' | 'ready' | 'unavailable';

