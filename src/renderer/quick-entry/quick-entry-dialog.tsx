import {
  ArrowLeftRight,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Calculator,
  Check,
  CreditCard,
  History,
  ShoppingCart,
  Sparkles,
  Tag,
  User,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { calculateFee, type AccountDefinition } from '../../shared/account-contract';
import type { ConfigurableRecord } from '../../shared/object-contract';
import type {
  OperationKind,
  PaymentMode,
  PriceSuggestionSource,
  QuickEntryDraft,
} from '../../shared/quick-entry-contract';
import type { TransactionRecord } from '../../shared/transaction-contract';
import type { PricingOverride, PricingProfile, PricingService, PricingSnapshot } from '../../shared/pricing-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { quickEntryCopy, quickEntryOversellCopy } from './quick-entry-i18n';

type QuickEntryDialogProps = Readonly<{
  initialOperation?: OperationKind;
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

export function QuickEntryDialog({
  initialOperation = 'sale',
  locale,
  onClose,
  onSuccess,
}: QuickEntryDialogProps) {
  const [operationKind, setOperationKind] = useState<OperationKind>(initialOperation);
  const [items, setItems] = useState<readonly ConfigurableRecord[]>([]);
  const [people, setPeople] = useState<readonly ConfigurableRecord[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountDefinition[]>([]);
  const [pricingProfiles, setPricingProfiles] = useState<readonly PricingProfile[]>([]);
  const [pricingServices, setPricingServices] = useState<readonly PricingService[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [customNote, setCustomNote] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [amount, setAmount] = useState<string>('');
  const [priceSource, setPriceSource] = useState<PriceSuggestionSource>('none');
  const [isAmountConfirmed, setIsAmountConfirmed] = useState<boolean>(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [toAccountId, setToAccountId] = useState<string>('');
  const [paidNowAmount, setPaidNowAmount] = useState<string>('');
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [collectorId, setCollectorId] = useState<string>('');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'inflow' | 'outflow'>('inflow');
  const [selectedPricingProfileId, setSelectedPricingProfileId] = useState('');
  const [selectedPricingServiceId, setSelectedPricingServiceId] = useState('');
  const [pricingCustomerType, setPricingCustomerType] = useState('retail');
  const [pricingInputMode, setPricingInputMode] = useState<'customer_pays' | 'customer_receives'>('customer_pays');
  const [providerCost, setProviderCost] = useState('');
  const [pricingPreview, setPricingPreview] = useState<PricingSnapshot>();
  const [pricingError, setPricingError] = useState<string>();
  const [pricingOverrides, setPricingOverrides] = useState<readonly PricingOverride[]>([]);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState<boolean>(false);

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Load items, people, accounts
  useEffect(() => {
    async function loadData() {
      try {
        const [iList, pList, aList, pricingList, serviceList] = await Promise.all([
          window.maxApi.objects.listRecords('item'),
          window.maxApi.objects.listRecords('person'),
          window.maxApi.accounts.list(),
          window.maxApi.pricing.list(),
          window.maxApi.pricing.services.list(),
        ]);
        setItems(iList);
        setPeople(pList);
        setAccounts(aList);
        setPricingProfiles(pricingList.filter((profile) => profile.active));
        setPricingServices(serviceList.filter((service) => service.active));
        if (aList[0]) {
          setSelectedAccountId(aList[0].id);
        }
        if (aList.length > 1 && aList[1]) {
          setToAccountId(aList[1].id);
        }
      } catch {
        setError(quickEntryCopy(locale, 'catalogLoadFailed'));
      }
    }
    void loadData();
  }, [locale]);

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
          setUnitPrice(String(suggestion.amount));
          const qtyNum = Math.max(1, Number(quantity) || 1);
          const totalCalc = Math.round(suggestion.amount * qtyNum * 100) / 100;
          setAmount(String(totalCalc));
          setPaidNowAmount(String(totalCalc));
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
    [accounts, quantity],
  );

  function handleItemSelect(id: string) {
    setSelectedItemId(id);
    const item = items.find((candidate) => candidate.id === id);
    setCustomNote(item?.label ?? '');
    void updateItemSuggestion(id);
    setTimeout(() => amountInputRef.current?.focus(), 50);
  }

  function handleQuantityChange(qtyStr: string) {
    setQuantity(qtyStr);
    const qtyNum = Math.max(1, Number(qtyStr) || 1);
    const uPrice = Number(unitPrice) || 0;
    if (uPrice > 0) {
      const calculated = Math.round(uPrice * qtyNum * 100) / 100;
      setAmount(String(calculated));
      setPaidNowAmount(String(calculated));
      setIsAmountConfirmed(true);
    }
  }

  function handleAmountChange(val: string) {
    setAmount(val);
    setPaidNowAmount(val);
    const qtyNum = Math.max(1, Number(quantity) || 1);
    if (qtyNum > 0) {
      setUnitPrice((Number(val) / qtyNum).toFixed(2));
    }
    setIsAmountConfirmed(true);
  }

  const totalAmountNum = Number(amount) || 0;
  const paidNowNum = Number(paidNowAmount) || 0;
  const customerDueNum = pricingPreview?.totals.customerTotal ?? totalAmountNum;
  const remainingDebt = Math.max(0, customerDueNum - paidNowNum);

  useEffect(() => {
    if (!selectedPricingProfileId || totalAmountNum <= 0) {
      setPricingPreview(undefined);
      setPricingError(undefined);
      return;
    }
    let active = true;
    void window.maxApi.quickEntry.quotePricing({
      accountId: selectedAccountId || undefined,
      operationKind,
      paymentMode,
      pricingCustomerType: pricingCustomerType || undefined,
      pricingInputMode,
      pricingOverrides,
      pricingProfileId: selectedPricingProfileId,
      pricingServiceId: selectedPricingServiceId || undefined,
      providerCost: providerCost === '' ? undefined : Number(providerCost),
      toAccountId: operationKind === 'transfer' ? toAccountId || undefined : undefined,
      totalAmount: totalAmountNum,
    }).then((result) => {
      if (!active) return;
      if (result.ok && result.value) {
        setPricingPreview(result.value);
        setPricingError(undefined);
        if (paymentMode === 'full') setPaidNowAmount(String(result.value.totals.customerTotal));
      } else if (!result.ok) {
        setPricingPreview(undefined);
        setPricingError(result.error.message);
      } else {
        setPricingPreview(undefined);
        setPricingError(undefined);
      }
    });
    return () => { active = false; };
  }, [operationKind, paymentMode, pricingCustomerType, pricingInputMode, pricingOverrides, providerCost, selectedAccountId, selectedPricingProfileId, selectedPricingServiceId, toAccountId, totalAmountNum]);

  // Selected item stock info
  const selectedItem = items.find((i) => i.id === selectedItemId);
  const currentStock = selectedItem?.currentQuantity;

  // Transfer fee calculation
  const sourceAccount = accounts.find((a) => a.id === selectedAccountId);
  const calculatedProviderFee = sourceAccount ? calculateFee(totalAmountNum, sourceAccount.feeConfig) : 0;
  const totalDebited = Math.round((totalAmountNum + calculatedProviderFee) * 100) / 100;

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    setSubmitting(true);
    setError(undefined);

    if (totalAmountNum <= 0) {
      setError(quickEntryCopy(locale, 'amountInvalid'));
      setSubmitting(false);
      return;
    }
    if (pricingOverrides.some(({ reason }) => !reason.trim())) {
      setError(quickEntryCopy(locale, 'overrideReasonRequired'));
      setSubmitting(false);
      return;
    }

    if (operationKind === 'sale') {
      if (selectedItem && currentStock !== undefined && currentStock !== null && currentStock < (Number(quantity) || 1)) {
        setError(quickEntryOversellCopy(locale, currentStock));
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
          setError(quickEntryCopy(locale, 'paidAmountInvalid'));
          setSubmitting(false);
          return;
        }
        if (!selectedPersonId) {
          setError(quickEntryCopy(locale, 'personRequiredCredit'));
          setSubmitting(false);
          return;
        }
      }

      if (paymentMode === 'later' && !selectedPersonId) {
        setError(quickEntryCopy(locale, 'personRequiredCredit'));
        setSubmitting(false);
        return;
      }
    } else if (operationKind === 'purchase' || operationKind === 'expense' || operationKind === 'income' || operationKind === 'adjustment') {
      if (!selectedAccountId) {
        setError(quickEntryCopy(locale, 'noAccounts'));
        setSubmitting(false);
        return;
      }
    } else if (operationKind === 'transfer') {
      if (!selectedAccountId || !toAccountId) {
        setError(quickEntryCopy(locale, 'transferAccountsRequired'));
        setSubmitting(false);
        return;
      }
      if (selectedAccountId === toAccountId) {
        setError(quickEntryCopy(locale, 'transferAccountsDifferent'));
        setSubmitting(false);
        return;
      }
    }

    const noteText = customNote.trim() || selectedItem?.label || (
      operationKind === 'sale' ? 'Sale' :
      operationKind === 'purchase' ? 'Purchase' :
      operationKind === 'expense' ? 'Expense' :
      operationKind === 'income' ? 'Income' :
      operationKind === 'adjustment' ? 'Adjustment' : 'Transfer'
    );

    const draft: QuickEntryDraft = {
      accountId: operationKind !== 'sale' || paymentMode !== 'later' ? selectedAccountId : undefined,
      adjustmentDirection: operationKind === 'adjustment' ? adjustmentDirection : undefined,
      collectorId: collectorId || undefined,
      itemId: selectedItemId || undefined,
      note: noteText,
      operationKind,
      paidAmount: paymentMode === 'full' ? totalAmountNum : paymentMode === 'partial' ? paidNowNum : 0,
      paymentMode,
      personId: selectedPersonId || undefined,
      pricingCustomerType: selectedPricingProfileId ? pricingCustomerType || undefined : undefined,
      pricingInputMode: selectedPricingProfileId ? pricingInputMode : undefined,
      pricingOverrides: selectedPricingProfileId ? [...pricingOverrides] : undefined,
      pricingProfileId: selectedPricingProfileId || undefined,
      pricingServiceId: selectedPricingServiceId || undefined,
      providerCost: selectedPricingProfileId && providerCost !== '' ? Number(providerCost) : undefined,
      providerFee: operationKind === 'transfer' ? calculatedProviderFee : undefined,
      quantity: (operationKind === 'sale' || operationKind === 'purchase') && selectedItem?.currentQuantity !== undefined
        ? (Number(quantity) || 1)
        : undefined,
      toAccountId: operationKind === 'transfer' ? toAccountId : undefined,
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

  const operations: { id: OperationKind; icon: typeof Zap; label: string }[] = [
    { id: 'sale', icon: Zap, label: quickEntryCopy(locale, 'operationSale') },
    { id: 'purchase', icon: ShoppingCart, label: quickEntryCopy(locale, 'operationPurchase') },
    { id: 'expense', icon: BanknoteArrowUp, label: quickEntryCopy(locale, 'operationExpense') },
    { id: 'income', icon: BanknoteArrowDown, label: quickEntryCopy(locale, 'operationIncome') },
    { id: 'transfer', icon: ArrowLeftRight, label: quickEntryCopy(locale, 'operationTransfer') },
    { id: 'adjustment', icon: Calculator, label: quickEntryCopy(locale, 'operationAdjustment') },
  ];
  const selectedPricingService = pricingServices.find((service) => service.id === selectedPricingServiceId);
  const availableAccounts = selectedPricingService
    ? accounts.filter((account) => selectedPricingService.paymentAccountTypes.includes(account.accountType))
    : accounts;

  return (
    <FocusedOverlay className="quick-entry-dialog" labelId="quick-entry-title" onClose={onClose}>
      <header className="dialog-header">
        <div className="quick-entry-header-title">
          <div className="quick-entry-badge">
            <Zap aria-hidden="true" size={16} />
            <span>MAX SPEED · Ctrl+S</span>
          </div>
          <h2 id="quick-entry-title">{quickEntryCopy(locale, 'quickActionTitle')}</h2>
          <p className="step-subtitle">{quickEntryCopy(locale, 'quickEntrySubtitle')}</p>
        </div>
        <button aria-label={quickEntryCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      {/* Operation Switcher */}
      <div className="operation-switcher-bar" role="tablist" aria-label={quickEntryCopy(locale, 'operationTypes')}>
        {operations.map((op) => {
          const Icon = op.icon;
          const isActive = operationKind === op.id;
          return (
            <button
              key={op.id}
              className={`operation-switcher-tab ${isActive ? 'operation-switcher-tab--active' : ''}`}
              data-active={isActive ? 'true' : undefined}
              onClick={() => {
                setOperationKind(op.id);
                if (selectedPricingService?.operation !== op.id) {
                  setSelectedPricingServiceId('');
                  setSelectedPricingProfileId('');
                  setPricingOverrides([]);
                }
                setError(undefined);
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{op.label}</span>
            </button>
          );
        })}
      </div>

      <form className="quick-entry-form" onSubmit={(e) => void handleSubmit(e)}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {/* SALE & PURCHASE: PRODUCT & QUANTITY */}
        {(operationKind === 'sale' || operationKind === 'purchase') && (
          <div className="quick-step-block">
            <div className="quick-step-head">
              <span className="step-num">1</span>
              <strong>{quickEntryCopy(locale, 'product')}</strong>
              {currentStock !== undefined && currentStock !== null && (
                <span className={`stock-badge ${currentStock <= 0 ? 'stock-badge--out' : 'stock-badge--in'}`}>
                  {quickEntryCopy(locale, 'inStock')}: {currentStock}
                </span>
              )}
            </div>

            <div className="field-grid-3">
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
                      {item.label} {item.currentQuantity !== undefined && item.currentQuantity !== null ? `(${item.currentQuantity})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field field--quantity">
                <span>{quickEntryCopy(locale, 'quantity')}</span>
                <input
                  min="1"
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  step="1"
                  type="number"
                  value={quantity}
                />
              </label>

              <label className="field">
                <span>{quickEntryCopy(locale, 'note')}</span>
                <input
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder={quickEntryCopy(locale, operationKind === 'sale' ? 'salePlaceholder' : 'purchasePlaceholder')}
                  value={customNote}
                />
              </label>
            </div>
          </div>
        )}

        {/* EXPENSE & INCOME: DESCRIPTION / CATEGORY */}
        {(operationKind === 'expense' || operationKind === 'income') && (
          <div className="quick-step-block">
            <div className="quick-step-head">
              <span className="step-num">1</span>
              <strong>{quickEntryCopy(locale, 'note')}</strong>
            </div>

            <div className="field-pair">
              <label className="field">
                <span>{quickEntryCopy(locale, 'note')}</span>
                <input
                  data-autofocus="true"
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder={quickEntryCopy(locale, operationKind === 'expense' ? 'expensePlaceholder' : 'incomePlaceholder')}
                  required
                  value={customNote}
                />
              </label>

              <label className="field">
                <span>{quickEntryCopy(locale, 'person')}</span>
                <select onChange={(e) => setSelectedPersonId(e.target.value)} value={selectedPersonId}>
                  <option value="">-- {quickEntryCopy(locale, 'optionalContact')} --</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {/* TRANSFER: SOURCE & DESTINATION ACCOUNTS */}
        {operationKind === 'transfer' && (
          <div className="quick-step-block">
            <div className="quick-step-head">
              <span className="step-num">1</span>
              <strong>{quickEntryCopy(locale, 'transfer')}</strong>
            </div>

            <div className="field-pair">
              <label className="field">
                <span>{quickEntryCopy(locale, 'fromAccount')}</span>
                <select
                  data-autofocus="true"
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  required
                  value={selectedAccountId}
                >
                  <option value="">-- {quickEntryCopy(locale, 'selectSourceAccount')} --</option>
                  {availableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.balance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>{quickEntryCopy(locale, 'toAccount')}</span>
                <select
                  onChange={(e) => setToAccountId(e.target.value)}
                  required
                  value={toAccountId}
                >
                  <option value="">-- {quickEntryCopy(locale, 'selectDestinationAccount')} --</option>
                  {availableAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.balance.toFixed(2)})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>{quickEntryCopy(locale, 'note')}</span>
              <input
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder={quickEntryCopy(locale, 'transferPlaceholder')}
                value={customNote}
              />
            </label>
          </div>
        )}

        {/* ADJUSTMENT: DIRECTION & NOTE */}
        {operationKind === 'adjustment' && (
          <div className="quick-step-block">
            <div className="quick-step-head">
              <span className="step-num">1</span>
              <strong>{quickEntryCopy(locale, 'adjustment')}</strong>
            </div>

            <div className="field-pair">
              <label className="field">
                <span>{quickEntryCopy(locale, 'adjustmentDirection')}</span>
                <select
                  data-autofocus="true"
                  onChange={(event) => setAdjustmentDirection(event.target.value as 'inflow' | 'outflow')}
                  value={adjustmentDirection}
                >
                  <option value="inflow">{quickEntryCopy(locale, 'adjustmentIncrease')}</option>
                  <option value="outflow">{quickEntryCopy(locale, 'adjustmentDecrease')}</option>
                </select>
              </label>

              <label className="field">
                <span>{quickEntryCopy(locale, 'note')}</span>
                <input
                  onChange={(event) => setCustomNote(event.target.value)}
                  placeholder={quickEntryCopy(locale, 'adjustmentPlaceholder')}
                  value={customNote}
                />
              </label>
            </div>
          </div>
        )}

        {/* AMOUNT STEP */}
        <div className="quick-step-block">
          <div className="quick-step-head">
            <span className="step-num">2</span>
            <strong>{selectedPricingService?.inputLabel || (selectedPricingProfileId ? quickEntryCopy(locale, pricingInputMode === 'customer_pays' ? 'customerPaysInput' : 'customerReceivesInput') : quickEntryCopy(locale, 'amount'))}</strong>
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

          <div className="quick-pricing-controls">
            <label className="field">
              <span>{quickEntryCopy(locale, 'service')}</span>
              <select onChange={(event) => {
                const serviceId = event.target.value;
                setSelectedPricingServiceId(serviceId);
                setPricingOverrides([]);
                const service = pricingServices.find((candidate) => candidate.id === serviceId);
                if (service) {
                  setSelectedPricingProfileId(service.pricingProfileId);
                  setPricingInputMode(service.defaultInputMode);
                  if (!customNote.trim()) setCustomNote(service.name);
                } else {
                  setSelectedPricingProfileId('');
                }
              }} value={selectedPricingServiceId}>
                <option value="">{quickEntryCopy(locale, 'noService')}</option>
                {pricingServices.filter((service) => service.operation === operationKind).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </label>
            {selectedPricingService && selectedPricingService.inputModes.length > 1 && <label className="field"><span>{quickEntryCopy(locale, 'pricingInput')}</span><select onChange={(event) => setPricingInputMode(event.target.value as typeof pricingInputMode)} value={pricingInputMode}>{selectedPricingService.inputModes.map((mode) => <option key={mode} value={mode}>{quickEntryCopy(locale, mode === 'customer_pays' ? 'customerPaysInput' : 'customerReceivesInput')}</option>)}</select></label>}
            {selectedPricingProfileId && <details className="quick-pricing-setup"><summary>{quickEntryCopy(locale, 'pricingDetails')}</summary><div>
              <label className="field"><span>{quickEntryCopy(locale, 'pricingProfile')}</span><select onChange={(event) => { setSelectedPricingProfileId(event.target.value); setPricingOverrides([]); }} value={selectedPricingProfileId}>{pricingProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
              <label className="field"><span>{quickEntryCopy(locale, 'customerType')}</span><input onChange={(event) => setPricingCustomerType(event.target.value)} placeholder="retail" value={pricingCustomerType} /></label>
              <label className="field"><span>{quickEntryCopy(locale, 'providerCost')}</span><input min="0" onChange={(event) => setProviderCost(event.target.value)} placeholder="0.00" step="0.01" type="number" value={providerCost} /></label>
            </div></details>}
          </div>

          {pricingError && <p className="form-error" role="alert">{pricingError}</p>}
          {pricingPreview && <div className="quick-pricing-preview">
            <div><span>{quickEntryCopy(locale, 'customerPaysInput')}</span><strong>{pricingPreview.totals.customerTotal.toFixed(2)}</strong></div>
            <div><span>{quickEntryCopy(locale, 'deliveredValue')}</span><strong>{pricingPreview.totals.deliveredValue.toFixed(2)}</strong></div>
            <div><span>{quickEntryCopy(locale, 'shopCost')}</span><strong>{pricingPreview.totals.shopNetCost.toFixed(2)}</strong></div>
            <div><span>{quickEntryCopy(locale, 'netProfit')}</span><strong>{pricingPreview.totals.netProfit.toFixed(2)}</strong></div>
          </div>}
          {pricingPreview && pricingPreview.componentResults.length > 0 && <details className="quick-pricing-overrides">
            <summary>{quickEntryCopy(locale, 'adjustPricing')}</summary>
            <div>
              {pricingPreview.componentResults.map((result) => {
                const current = pricingOverrides.find(({ componentId }) => componentId === result.componentId);
                return <div className="quick-pricing-override-row" key={result.componentId}>
                  <span>{result.label}<small>{result.calculatedAmount.toFixed(2)}</small></span>
                  <input aria-label={`${result.label} actual amount`} min="0" onChange={(event) => {
                    const amount = Number(event.target.value);
                    setPricingOverrides((overrides) => [
                      ...overrides.filter(({ componentId }) => componentId !== result.componentId),
                      { actor: 'local-user', amount: Number.isFinite(amount) ? amount : result.calculatedAmount, componentId: result.componentId, reason: current?.reason ?? '' },
                    ]);
                  }} step="0.01" type="number" value={current?.amount ?? result.actualAmount} />
                  <input aria-label={`${result.label} ${quickEntryCopy(locale, 'overrideReason')}`} onChange={(event) => {
                    setPricingOverrides((overrides) => [
                      ...overrides.filter(({ componentId }) => componentId !== result.componentId),
                      { actor: 'local-user', amount: current?.amount ?? result.actualAmount, componentId: result.componentId, reason: event.target.value },
                    ]);
                  }} placeholder={quickEntryCopy(locale, 'overrideReason')} value={current?.reason ?? ''} />
                </div>;
              })}
            </div>
          </details>}

          {/* Transfer Fee Preview */}
          {operationKind === 'transfer' && totalAmountNum > 0 && (
            <div className="transfer-fee-breakdown">
              {calculatedProviderFee > 0 && (
                <div className="fee-row">
                  <span>{quickEntryCopy(locale, 'providerFee')}:</span>
                  <strong>+{calculatedProviderFee.toFixed(2)}</strong>
                </div>
              )}
              <div className="fee-row fee-row--total">
                <span>{quickEntryCopy(locale, 'totalTransfer')}:</span>
                <strong>{totalDebited.toFixed(2)}</strong>
              </div>
            </div>
          )}

          {!isAmountConfirmed && priceSource === 'historical-last' && (
            <small className="field-hint field-hint--warning">{quickEntryCopy(locale, 'unconfirmedHint')}</small>
          )}
        </div>

        {/* STEP 3: METHOD / ACCOUNT / MODE (For non-transfers) */}
        {operationKind !== 'transfer' && (
          <div className="quick-step-block">
            <div className="quick-step-head">
              <span className="step-num">3</span>
              <strong>{quickEntryCopy(locale, 'method')}</strong>
            </div>

            {/* Mode Selector for Sales */}
            {operationKind === 'sale' && (
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
            )}

            {/* Account Chips */}
            {(operationKind !== 'sale' || paymentMode !== 'later') && (
              <div className="quick-account-selector">
                {availableAccounts.map((acc) => (
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
            {operationKind === 'sale' && paymentMode === 'partial' && (
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
            {operationKind === 'sale' && paymentMode === 'later' && (
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
                    <option value="">{quickEntryCopy(locale, 'noCollector')}</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* Purchase Supplier Details */}
            {operationKind === 'purchase' && (
              <label className="field" style={{ marginTop: '0.75rem' }}>
                <span>{quickEntryCopy(locale, 'supplier')}</span>
                <select onChange={(e) => setSelectedPersonId(e.target.value)} value={selectedPersonId}>
                  <option value="">-- {quickEntryCopy(locale, 'optionalSupplier')} --</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <footer className="form-footer">
          <Button onClick={onClose}>{quickEntryCopy(locale, 'cancel')}</Button>
          <Button
            disabled={submitting || totalAmountNum <= 0}
            icon={
              operationKind === 'sale' ? <Zap aria-hidden="true" size={16} /> :
              operationKind === 'purchase' ? <ShoppingCart aria-hidden="true" size={16} /> :
              operationKind === 'expense' ? <BanknoteArrowUp aria-hidden="true" size={16} /> :
              operationKind === 'income' ? <BanknoteArrowDown aria-hidden="true" size={16} /> :
              operationKind === 'adjustment' ? <Calculator aria-hidden="true" size={16} /> :
              <ArrowLeftRight aria-hidden="true" size={16} />
            }
            type="submit"
            variant="primary"
          >
            {operationKind === 'sale' ? quickEntryCopy(locale, 'recordSale') :
             operationKind === 'purchase' ? quickEntryCopy(locale, 'recordPurchase') :
             operationKind === 'expense' ? quickEntryCopy(locale, 'recordExpense') :
             operationKind === 'income' ? quickEntryCopy(locale, 'recordIncome') :
             operationKind === 'adjustment' ? quickEntryCopy(locale, 'recordAdjustment') :
             quickEntryCopy(locale, 'recordTransfer')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}
