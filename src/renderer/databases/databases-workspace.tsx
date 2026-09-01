import {
  CircleDollarSign,
  ContactRound,
  Database,
  Package,
  Plus,
  ReceiptText,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { AccountsWorkspace } from '../accounts/accounts-workspace';
import type { Locale } from '../app/i18n';
import { ObjectWorkspace } from '../objects/object-workspace';
import { ReconciliationWorkspace } from '../reconciliation/reconciliation-workspace';
import { TransactionsWorkspace } from '../transactions/transactions-workspace';
import type { NavigationItem } from '../../shared/workspace-contract';
import { DatabasePage } from './DatabasePage';

export type DatabaseTab = 'accounts' | 'items' | 'people' | 'reconciliation' | 'transactions' | (string & {});

type DatabasesWorkspaceProps = Readonly<{
  initialTab?: DatabaseTab;
  locale: Locale;
}>;

const builtInTabs: readonly Readonly<{
  icon: LucideIcon;
  id: DatabaseTab;
  labelAr: string;
  labelEn: string;
}>[] = [
  { icon: Package, id: 'items', labelAr: 'الأصناف والمخزون', labelEn: 'Items & Products' },
  { icon: ContactRound, id: 'people', labelAr: 'العملاء والموردين', labelEn: 'People & Contacts' },
  { icon: ReceiptText, id: 'transactions', labelAr: 'المعاملات والحركات', labelEn: 'Transactions' },
  { icon: CircleDollarSign, id: 'accounts', labelAr: 'الحسابات والخزائن', labelEn: 'Accounts & Drawers' },
  { icon: Scale, id: 'reconciliation', labelAr: 'المطابقة اليومية', labelEn: 'Daily Reconciliation' },
];

export function DatabasesWorkspace({ initialTab = 'items', locale }: DatabasesWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<DatabaseTab>(initialTab);
  const [customDatabases, setCustomDatabases] = useState<readonly NavigationItem[]>([]);

  const loadDatabases = useCallback(async () => {
    try {
      const nav = await window.maxApi.workspace.getNavigation();
      setCustomDatabases(nav.databases || []);
    } catch {
      setCustomDatabases([]);
    }
  }, []);

  useEffect(() => {
    void loadDatabases();
  }, [loadDatabases]);

  const handleCreateDatabase = async () => {
    const title = window.prompt(locale === 'ar' ? 'اسم قاعدة البيانات الجديدة:' : 'New Database Name:');
    if (!title || !title.trim()) return;

    const res = await window.maxApi.workspace.createDatabase({
      title: title.trim(),
      visibility: 'normal',
    });

    if (res.ok) {
      await loadDatabases();
      setActiveTab(res.value.id);
    }
  };

  const isBuiltIn = builtInTabs.some((t) => t.id === activeTab);

  return (
    <div className="databases-workspace">
      <div className="databases-header">
        <div className="databases-header__info">
          <div className="databases-header__icon">
            <Database aria-hidden="true" size={24} />
          </div>
          <div>
            <h2>{locale === 'ar' ? 'قواعد البيانات' : 'Databases'}</h2>
            <p>
              {locale === 'ar'
                ? 'جميع قواعد البيانات والمخزون وجهات التعامل والحسابات والمعاملات في مساحة واحدة.'
                : 'All shop databases, inventory, contacts, accounts, and transactions in one unified workspace.'}
            </p>
          </div>
        </div>

        <nav aria-label="Databases Switcher" className="databases-tabs">
          {builtInTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const label = locale === 'ar' ? tab.labelAr : tab.labelEn;

            return (
              <button
                key={tab.id}
                aria-current={isActive ? 'page' : undefined}
                className="databases-tab"
                data-active={isActive}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                <span>{label}</span>
              </button>
            );
          })}

          {/* Custom / Migrated Generic Databases */}
          {customDatabases.map((db) => {
            const isActive = activeTab === db.id;
            return (
              <button
                key={db.id}
                aria-current={isActive ? 'page' : undefined}
                className="databases-tab"
                data-active={isActive}
                onClick={() => setActiveTab(db.id)}
                type="button"
              >
                <Database aria-hidden="true" size={17} />
                <span>{db.title}</span>
              </button>
            );
          })}

          {/* New Database Button */}
          <button
            type="button"
            className="databases-tab text-muted hover:text-foreground"
            onClick={() => void handleCreateDatabase()}
            title="Create new database"
          >
            <Plus size={16} className="mr-1" />
            <span>{locale === 'ar' ? 'قاعدة جديدة' : 'New Database'}</span>
          </button>
        </nav>
      </div>

      <div className="databases-tab-content">
        {activeTab === 'items' && (
          <ObjectWorkspace createRequest={0} key="items" locale={locale} objectKind="item" />
        )}
        {activeTab === 'people' && (
          <ObjectWorkspace createRequest={0} key="people" locale={locale} objectKind="person" />
        )}
        {activeTab === 'transactions' && (
          <TransactionsWorkspace createRequest={0} key="transactions" locale={locale} />
        )}
        {activeTab === 'accounts' && (
          <AccountsWorkspace createRequest={0} key="accounts" locale={locale} />
        )}
        {activeTab === 'reconciliation' && (
          <ReconciliationWorkspace key="reconciliation" locale={locale} />
        )}

        {/* Render Generic Workspace Database */}
        {!isBuiltIn && <DatabasePage key={activeTab} databaseId={activeTab} locale={locale} />}
      </div>
    </div>
  );
}
