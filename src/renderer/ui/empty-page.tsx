import { CircleDollarSign, ContactRound, Eye, Package, Plus, ReceiptText, Scale, Search } from 'lucide-react';

import type { AppPage } from '../app/app-types';
import { type Locale, type TranslationKey, translate } from '../app/i18n';
import { Button } from './button';

type EmptyPageProps = Readonly<{
  locale: Locale;
  onCreate: () => void;
  onNavigate: (page: AppPage) => void;
  onOpenCommand: () => void;
  page: AppPage;
}>;

const pageContent: Record<Exclude<AppPage, 'home'>, Readonly<{
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
  views: { body: 'viewEmptyBody', create: 'viewCreate', empty: 'viewEmpty', icon: Eye },
};

function HomePage({ locale, onNavigate, onOpenCommand }: Pick<EmptyPageProps, 'locale' | 'onNavigate' | 'onOpenCommand'>) {
  const cards: readonly Readonly<{ body: TranslationKey; title: TranslationKey }>[] = [
    { body: 'localFirstBody', title: 'localFirst' },
    { body: 'readyToConfigureBody', title: 'readyToConfigure' },
    { body: 'speedBody', title: 'speed' },
  ];

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero__glow" aria-hidden="true" />
        <p className="eyebrow">MAX · LOCAL WORKSPACE</p>
        <h2>{translate(locale, 'homeTitle')}</h2>
        <p>{translate(locale, 'homeBody')}</p>
        <div className="home-hero__actions">
          <Button icon={<Package aria-hidden="true" size={18} />} onClick={() => onNavigate('items')} variant="primary">
            {translate(locale, 'exploreItems')}
          </Button>
          <Button icon={<Search aria-hidden="true" size={18} />} onClick={onOpenCommand}>
            {translate(locale, 'openCommand')}
          </Button>
        </div>
      </section>
      <section aria-label={translate(locale, 'workspace')} className="principle-grid">
        {cards.map(({ body, title }, index) => (
          <article className="principle-card" key={title}>
            <span className="principle-card__number">0{index + 1}</span>
            <h3>{translate(locale, title)}</h3>
            <p>{translate(locale, body)}</p>
          </article>
        ))}
      </section>
      <section className="keyboard-note">
        <kbd>Tab</kbd><kbd>Enter</kbd><kbd>Esc</kbd><kbd>↑ ↓</kbd>
        <div>
          <strong>{translate(locale, 'keyboard')}</strong>
          <p>{translate(locale, 'keyboardBody')}</p>
        </div>
      </section>
    </div>
  );
}

export function EmptyPage({ locale, onCreate, onNavigate, onOpenCommand, page }: EmptyPageProps) {
  if (page === 'home') {
    return <HomePage locale={locale} onNavigate={onNavigate} onOpenCommand={onOpenCommand} />;
  }

  const content = pageContent[page];
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
