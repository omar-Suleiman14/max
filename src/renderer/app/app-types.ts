import type { LucideIcon } from 'lucide-react';

export type AppPage = 'accounts' | 'home' | 'items' | 'people' | 'reconciliation' | 'transactions' | 'views';

export type NavigationItem = Readonly<{
  icon: LucideIcon;
  page: AppPage;
}>;

export type EngineStatus = 'checking' | 'ready' | 'unavailable';
