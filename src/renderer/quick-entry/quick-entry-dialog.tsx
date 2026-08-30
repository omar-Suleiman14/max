import {
  Check,
  CreditCard,
  History,
  Sparkles,
  Tag,
  User,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import type { AccountDefinition } from '../../shared/account-contract';
import type { ConfigurableRecord } from '../../shared/object-contract';
import type {
  PaymentMode,
  PriceSuggestionSource,
  QuickEntryDraft,
} from '../../shared/quick-entry-contract';
import type { TransactionRecord } from '../../shared/transaction-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { quickEntryCopy } from './quick-entry-i18n';

type QuickEntryDialogProps = Readonly<{
  locale: Locale;
  onClose: () => void;
  onSuccess: (tx: TransactionRecord) => void;
}>;

function sourceBadge(source: PriceSuggestionSource, isConfirmed: boolean, locale: Locale) {
  if (source === 'historical-last' && !isConfirmed) {
    return (
      <span className="source-badge source-badge--unconfirmed">
        <History aria-hidden="true" size={12} />
        {quickEntryCopy(locale, 'sourceHistorical')}
      </span>
    );
  }
  if (source === 'item-price') {
    return (
      <span className="source-badge source-badge--item">
        <Tag aria-hidden="true" size={12} />
        {quickEntryCopy(locale, 'sourceItem')}
      </span>
    );
  }
  if (source === 'template-default') {
    return (
      <span className="source-badge source-badge--template">
        <Sparkles aria-hidden="true" size={12} />
        {quickEntryCopy(locale, 'sourceTemplate')}
      </span>
    );
  }
  return null;
}

export function QuickEntryDialog({ locale, onClose, onSuccess }: QuickEntryDialogProps) {
  const [items, setItems] = useState<readonly ConfigurableRecord[]>([]);
  const [people, setPeople] = useState<readonly ConfigurableRecord[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountDefinition[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [customNote, setCustomNote] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [priceSource, setPriceSource] = useState<PriceSuggestionSource>('none');
  const [isAmountConfirmed, setIsAmountConfirmed] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [paidNowAmount, setPaidNowAmount] = useState<string>('');
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [collectorId, setCollectorId] = useState<string>('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState<boolean>(false);

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Load items, people, accounts
  useEffect(() => {
    async function loadData() {
      try {
        const [iList, pList, aList] = await Promise.all([
          window.maxApi.objects.listRecords('item'),
          window.maxApi.objects.listRecords('person'),
          window.maxApi.accounts.list(),
        ]);
        setItems(iList);
        setPeople(pList);
        setAccounts(aList);
        if (aList[0]) {
          setSelectedAccountId(aList[0].id);
        }
      } catch {
        setError('Failed to load shop catalog.');
      }
    }
    void loadData();
  }, []);

  // Fetch price suggestion when item changes
  const updateItemSuggestion = useCallback(
    async (itemId?: string) => {
      if (!itemId) {
        setPriceSource('none');
        return;
      }
      try {
        const suggestion = await window.maxApi.quickEntry.getSuggestion(itemId);
        if (suggestion.amount !== null) {
          setAmount(String(suggestion.amount));
          setPaidNowAmount(String(suggestion.amount));
          setPriceSource(suggestion.source);
          setIsAmountConfirmed(suggestion.source !== 'historical-last');
        } else {
          setPriceSource('none');
          setIsAmountConfirmed(false);
        }
        if (suggestion.lastAccountId && accounts.some((a) => a.id === suggestion.lastAccountId)) {
          setSelectedAccountId(suggestion.lastAccountId);
        }
      } catch {
        setPriceSource('none');
      }
    },
    [accounts],
  );

  function handleItemSelect(id: string) {
    setSelectedItemId(id);
    const item = items.find((candidate) => candidate.id === id);
    setCustomNote(item?.label ?? '');
    void updateItemSuggestion(id);
    setTimeout(() => amountInputRef.current?.focus(), 50);
  }

  function handleAmountChange(val: string) {
    setAmount(val);
    setPaidNowAmount(val);
    setIsAmountConfirmed(true);
  }

  const totalAmountNum = Number(amount) || 0;
  const paidNowNum = Number(paidNowAmount) || 0;
  const remainingDebt = Math.max(0, totalAmountNum - paidNowNum);

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    setSubmitting(true);

    if (totalAmountNum <= 0) {
      setError('Please enter a valid amount greater than zero.');
      setSubmitting(false);
      return;
    }

    if (paymentMode === 'full' && !selectedAccountId) {
      setError(quickEntryCopy(locale, 'noAccounts'));
      setSubmitting(false);
      return;
    }

    if (paymentMode === 'partial') {
      if (paidNowNum <= 0 || paidNowNum >= totalAmountNum) {
        setError('Paid amount must be between 0 and total amount.');
        setSubmitting(false);
        return;
      }
      if (!selectedPersonId) {
        setError('Please select a customer/person for the remaining debt balance.');
        setSubmitting(false);
        return;
      }
    }

    if (paymentMode === 'later' && !selectedPersonId) {
      setError('Please select a customer/person for credit purchases.');
      setSubmitting(false);
      return;
    }

    const selectedItem = items.find((i) => i.id === selectedItemId);
    const noteText = customNote.trim() || selectedItem?.label || 'Quick Sale';

    const draft: QuickEntryDraft = {
      accountId: paymentMode !== 'later' ? selectedAccountId : undefined,
      collectorId: collectorId || undefined,
      itemId: selectedItemId || undefined,
      note: noteText,
      paidAmount: paymentMode === 'full' ? totalAmountNum : paymentMode === 'partial' ? paidNowNum : 0,
      paymentMode,
      personId: selectedPersonId || undefined,
      totalAmount: totalAmountNum,
    };

    const res = await window.maxApi.quickEntry.submit(draft);
    setSubmitting(false);

    if (res.ok) {
      onSuccess(res.value);
      onClose();
    } else {
      setError(res.error.message);
    }
  }

  return (
    <FocusedOverlay className="quick-entry-dialog" labelId="quick-entry-title" onClose={onClose}>
      <header className="dialog-header">
        <div className="quick-entry-header-title">
          <div className="quick-entry-badge">
            <Zap aria-hidden="true" size={16} />
            <span>MAX SPEED</span>
          </div>
          <h2 id="quick-entry-title">{quickEntryCopy(locale, 'quickEntry')}</h2>
          <p className="step-subtitle">{quickEntryCopy(locale, 'quickEntrySubtitle')}</p>
        </div>
        <button aria-label={quickEntryCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <form className="quick-entry-form" onSubmit={(e) => void handleSubmit(e)}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {/* STEP 1: PRODUCT */}
        <div className="quick-step-block">
          <div className="quick-step-head">
            <span className="step-num">1</span>
            <strong>{quickEntryCopy(locale, 'product')}</strong>
          </div>

          <div className="field-pair">
            <label className="field">
              <span>{quickEntryCopy(locale, 'selectItem')}</span>
              <select
                data-autofocus="true"
                onChange={(e) => handleItemSelect(e.target.value)}
                value={selectedItemId}
              >
                <option value="">-- {quickEntryCopy(locale, 'customProduct')} --</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{quickEntryCopy(locale, 'note')}</span>
              <input onChange={(e) => setCustomNote(e.target.value)} placeholder="e.g., Screen Protector + Fitting" value={customNote} />
            </label>
          </div>
        </div>

        {/* STEP 2: AMOUNT */}
        <div className="quick-step-block">
          <div className="quick-step-head">
            <span className="step-num">2</span>
            <strong>{quickEntryCopy(locale, 'amount')}</strong>
            {sourceBadge(priceSource, isAmountConfirmed, locale)}
          </div>

          <div className="quick-amount-wrapper">
            <input
              ref={amountInputRef}
              className={`quick-amount-input ${!isAmountConfirmed && priceSource === 'historical-last' ? 'quick-amount-input--unconfirmed' : ''}`}
              min="0.01"
              onChange={(e) => handleAmountChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setIsAmountConfirmed(true);
                }
              }}
              placeholder="0.00"
              required
              step="0.01"
              type="number"
              value={amount}
            />

            {!isAmountConfirmed && priceSource === 'historical-last' && (
              <Button
                className="confirm-badge-btn"
                icon={<Check aria-hidden="true" size={14} />}
                onClick={() => setIsAmountConfirmed(true)}
                type="button"
              >
                {quickEntryCopy(locale, 'confirmAndNext')}
              </Button>
            )}
          </div>
          {!isAmountConfirmed && priceSource === 'historical-last' && (
            <small className="field-hint field-hint--warning">{quickEntryCopy(locale, 'unconfirmedHint')}</small>
          )}
        </div>

        {/* STEP 3: METHOD & MODE */}
        <div className="quick-step-block">
          <div className="quick-step-head">
            <span className="step-num">3</span>
            <strong>{quickEntryCopy(locale, 'method')}</strong>
          </div>

          {/* Mode Selector */}
          <div className="payment-mode-tabs" role="tablist">
            <button
              className="payment-mode-tab"
              data-active={paymentMode === 'full'}
              onClick={() => setPaymentMode('full')}
              type="button"
            >
              <CreditCard aria-hidden="true" size={15} />
              {quickEntryCopy(locale, 'fullPayment')}
            </button>
            <button
              className="payment-mode-tab"
              data-active={paymentMode === 'partial'}
              onClick={() => setPaymentMode('partial')}
              type="button"
            >
              <User aria-hidden="true" size={15} />
              {quickEntryCopy(locale, 'partialPayment')}
            </button>
            <button
              className="payment-mode-tab"
              data-active={paymentMode === 'later'}
              onClick={() => setPaymentMode('later')}
              type="button"
            >
              <History aria-hidden="true" size={15} />
              {quickEntryCopy(locale, 'laterPayment')}
            </button>
          </div>

          {paymentMode !== 'later' && (
            <div className="quick-account-selector">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  className="quick-account-chip"
                  data-selected={selectedAccountId === acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  type="button"
                >
                  <strong>{acc.name}</strong>
                  <span>{acc.balance.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Partial Details */}
          {paymentMode === 'partial' && (
            <div className="partial-breakdown-card">
              <div className="field-pair">
                <label className="field">
                  <span>{quickEntryCopy(locale, 'paidNow')}</span>
                  <input
                    max={totalAmountNum}
                    min="0.01"
                    onChange={(e) => setPaidNowAmount(e.target.value)}
                    required
                    step="0.01"
                    type="number"
                    value={paidNowAmount}
                  />
                </label>

                <div className="field">
                  <span>{quickEntryCopy(locale, 'remaining')}</span>
                  <div className="remaining-badge">{remainingDebt.toFixed(2)}</div>
                </div>
              </div>

              <label className="field">
                <span>{quickEntryCopy(locale, 'person')}</span>
                <select
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  required
                  value={selectedPersonId}
                >
                  <option value="">-- {quickEntryCopy(locale, 'selectPerson')} --</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Later / Credit Details */}
          {paymentMode === 'later' && (
            <div className="partial-breakdown-card">
              <label className="field">
                <span>{quickEntryCopy(locale, 'person')}</span>
                <select
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  required
                  value={selectedPersonId}
                >
                  <option value="">-- {quickEntryCopy(locale, 'selectPerson')} --</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>{quickEntryCopy(locale, 'collector')}</span>
                <select onChange={(e) => setCollectorId(e.target.value)} value={collectorId}>
                  <option value="">None</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        <footer className="form-footer">
          <Button onClick={onClose}>{quickEntryCopy(locale, 'cancel')}</Button>
          <Button
            disabled={submitting || totalAmountNum <= 0}
            icon={<Zap aria-hidden="true" size={16} />}
            type="submit"
            variant="primary"
          >
            {quickEntryCopy(locale, 'recordSale')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}
