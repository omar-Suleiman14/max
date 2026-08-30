import {
  CircleDollarSign,
  ContactRound,
  Database,
  Package,
  ReceiptText,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { AccountsWorkspace } from '../accounts/accounts-workspace';
import type { Locale } from '../app/i18n';
import { ObjectWorkspace } from '../objects/object-workspace';
import { ReconciliationWorkspace } from '../reconciliation/reconciliation-workspace';
import { TransactionsWorkspace } from '../transactions/transactions-workspace';

export type DatabaseTab = 'accounts' | 'items' | 'people' | 'reconciliation' | 'transactions';

type DatabasesWorkspaceProps = Readonly<{
  initialTab?: DatabaseTab;
  locale: Locale;
}>;

const dbTabs: readonly Readonly<{
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
          {dbTabs.map((tab) => {
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
      </div>
    </div>
  );
}
