import {
  CircleDollarSign,
  ContactRound,
  FileText,
  Package,
  Plus,
  ReceiptText,
  Scale,
  Search,
} from 'lucide-react';

import { type Locale, type TranslationKey, translate } from '../app/i18n';
import { Button } from './button';

export type EmptyPageTarget = 'accounts' | 'items' | 'people' | 'reconciliation' | 'transactions' | (string & {});

type EmptyPageProps = Readonly<{
  locale: Locale;
  onCreate: () => void;
  onOpenCommand: () => void;
  page: EmptyPageTarget;
}>;

const pageContent: Record<string, Readonly<{
  body: TranslationKey;
  create: TranslationKey;
  empty: TranslationKey;
  icon: typeof Package;
}>> = {
  accounts: { body: 'accountEmptyBody', create: 'accountCreate', empty: 'accountEmpty', icon: CircleDollarSign },
  items: { body: 'itemEmptyBody', create: 'itemCreate', empty: 'itemEmpty', icon: Package },
  people: { body: 'personEmptyBody', create: 'personCreate', empty: 'personEmpty', icon: ContactRound },
  reconciliation: { body: 'reconciliationEmptyBody', create: 'reconciliationCreate', empty: 'reconciliationEmpty', icon: Scale },
  transactions: { body: 'transactionEmptyBody', create: 'transactionCreate', empty: 'transactionEmpty', icon: ReceiptText },
};

export function EmptyPage({ locale, onCreate, onOpenCommand, page }: EmptyPageProps) {
  const content = pageContent[page];

  // Anything without its own empty state — including a brand new workspace —
  // gets a bare screen whose only suggestion is to write something down.
  if (!content) {
    return (
      <section className="empty-state">
        <div className="empty-state__icon"><FileText aria-hidden="true" size={27} strokeWidth={1.65} /></div>
        <h2>{translate(locale, 'emptyWorkspaceTitle')}</h2>
        <p>{translate(locale, 'emptyWorkspaceBody')}</p>
        <div className="empty-state__actions">
          <Button icon={<Plus aria-hidden="true" size={18} />} onClick={onCreate} variant="primary">
            {translate(locale, 'createNote')}
          </Button>
        </div>
      </section>
    );
  }

  const Icon = content.icon;
  return (
    <section className="empty-state">
      <div className="empty-state__icon"><Icon aria-hidden="true" size={27} strokeWidth={1.65} /></div>
      <p className="eyebrow">{translate(locale, 'createSomething')}</p>
      <h2>{translate(locale, content.empty)}</h2>
      <p>{translate(locale, content.body)}</p>
      <div className="empty-state__actions">
        <Button icon={<Plus aria-hidden="true" size={18} />} onClick={onCreate} variant="primary">
          {translate(locale, content.create)}
        </Button>
        <Button icon={<Search aria-hidden="true" size={18} />} onClick={onOpenCommand}>
          {translate(locale, 'openCommand')}
        </Button>
      </div>
    </section>
  );
}
