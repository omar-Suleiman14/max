import {
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  ContactRound,
  History,
  Landmark,
  Package,
  Plus,
  Receipt,
  RotateCcw,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { calculateFee, type AccountDefinition } from '../../shared/account-contract';
import type { ConfigurableRecord } from '../../shared/object-contract';
import type {
  LedgerSummary,
  MovementType,
  PaymentStatus,
  TransactionDraft,
  TransactionRecord,
  TransactionType,
  TransferDraft,
} from '../../shared/transaction-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { transactionsCopy } from './transactions-i18n';

type TransactionsWorkspaceProps = Readonly<{
  createRequest: number;
  locale: Locale;
  refreshRequest?: number;
  requestedCreateType?: Exclude<TransactionType, 'reversal'>;
}>;

function typeBadge(type: TransactionType, locale: Locale) {
  switch (type) {
    case 'sale':
      return <span className="badge badge--success">{transactionsCopy(locale, 'sale')}</span>;
    case 'income':
      return <span className="badge badge--success">{transactionsCopy(locale, 'income')}</span>;
    case 'expense':
      return <span className="badge badge--danger">{transactionsCopy(locale, 'expense')}</span>;
    case 'purchase':
      return <span className="badge badge--warning">{transactionsCopy(locale, 'purchase')}</span>;
    case 'transfer':
      return <span className="badge badge--info">{transactionsCopy(locale, 'transfer')}</span>;
    case 'reversal':
      return <span className="badge badge--purple">{transactionsCopy(locale, 'reversal')}</span>;
    case 'adjustment':
      return <span className="badge badge--purple">{transactionsCopy(locale, 'adjustment')}</span>;
    default:
      return <span className="badge">{type}</span>;
  }
}

function statusBadge(status: PaymentStatus, reversed: boolean, locale: Locale) {
  if (reversed) {
    return <span className="badge badge--muted">{transactionsCopy(locale, 'reversed')}</span>;
  }
  switch (status) {
    case 'paid':
      return <span className="badge badge--success">{transactionsCopy(locale, 'paid')}</span>;
    case 'partial':
      return <span className="badge badge--warning">{transactionsCopy(locale, 'partial')}</span>;
    case 'unpaid':
      return <span className="badge badge--danger">{transactionsCopy(locale, 'unpaid')}</span>;
  }
}

function TransactionEditor({
  accounts,
  initialType,
  items,
  locale,
  onClose,
  onSave,
  people,
}: Readonly<{
  accounts: readonly AccountDefinition[];
  initialType?: Exclude<TransactionType, 'reversal' | 'transfer'>;
  items: readonly ConfigurableRecord[];
  locale: Locale;
  onClose: () => void;
  onSave: (draft: TransactionDraft) => Promise<string | undefined>;
  people: readonly ConfigurableRecord[];
}>) {
  const [transactionType, setTransactionType] = useState<Exclude<TransactionType, 'reversal' | 'transfer'>>(initialType ?? 'sale');
  const [totalAmount, setTotalAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '');
  const [personId, setPersonId] = useState('');
  const [itemId, setItemId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [adjustmentMovementType, setAdjustmentMovementType] = useState<MovementType>('inflow');

  // Auto-sync paid amount with total amount unless user modifies it
  function handleTotalChange(val: string) {
    setTotalAmount(val);
    if (paidAmount === '' || paidAmount === totalAmount) {
      setPaidAmount(val);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const total = Number(totalAmount);
    const paid = Number(paidAmount);

    if (!Number.isFinite(total) || total < 0) {
      setError('Please enter a valid total amount.');
      setSaving(false);
      return;
    }
    if (!Number.isFinite(paid) || paid < 0) {
      setError('Please enter a valid paid amount.');
      setSaving(false);
      return;
    }
    if (paid > total) {
      setError('Paid amount cannot exceed total amount.');
      setSaving(false);
      return;
    }

    const movements = [];
    if (paid > 0) {
      if (!selectedAccountId) {
        setError(transactionsCopy(locale, 'noPaymentAccount'));
        setSaving(false);
        return;
      }
      const movementType: MovementType = transactionType === 'adjustment'
        ? adjustmentMovementType
        : transactionType === 'sale' || transactionType === 'income'
          ? 'inflow'
          : 'outflow';
      movements.push({
        accountId: selectedAccountId,
        amount: paid,
        movementType,
      });
    }

    const nextError = await onSave({
      itemId: itemId || undefined,
      movements,
      note: note.trim() || undefined,
      paidAmount: paid,
      personId: personId || undefined,
      totalAmount: total,
      transactionType,
    });
    setSaving(false);
    setError(nextError);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="tx-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {transactionsCopy(locale, 'transaction')}</p>
          <h2 id="tx-dialog-title">{transactionsCopy(locale, 'createTransaction')}</h2>
        </div>
        <button aria-label={transactionsCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <form className="object-form" onSubmit={(e) => void submit(e)}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <label className="field">
          <span>{transactionsCopy(locale, 'transactionType')}</span>
          <select onChange={(e) => setTransactionType(e.target.value as Exclude<TransactionType, 'reversal' | 'transfer'>)} value={transactionType}>
            <option value="sale">{transactionsCopy(locale, 'sale')}</option>
            <option value="expense">{transactionsCopy(locale, 'expense')}</option>
            <option value="purchase">{transactionsCopy(locale, 'purchase')}</option>
            <option value="income">{transactionsCopy(locale, 'income')}</option>
            <option value="adjustment">{transactionsCopy(locale, 'adjustment')}</option>
          </select>
        </label>

        {transactionType === 'adjustment' && (
          <label className="field">
            <span>{locale === 'ar' ? 'اتجاه التسوية' : 'Adjustment direction'}</span>
            <select onChange={(event) => setAdjustmentMovementType(event.target.value as MovementType)} value={adjustmentMovementType}>
              <option value="inflow">{locale === 'ar' ? 'زيادة رصيد الحساب' : 'Increase account balance'}</option>
              <option value="outflow">{locale === 'ar' ? 'خفض رصيد الحساب' : 'Decrease account balance'}</option>
            </select>
          </label>
        )}

        <div className="field-pair">
          <label className="field">
            <span>{transactionsCopy(locale, 'totalAmount')}</span>
            <input
              data-autofocus="true"
              min="0"
              onChange={(e) => handleTotalChange(e.target.value)}
              placeholder="0.00"
              required
              step="0.01"
              type="number"
              value={totalAmount}
            />
          </label>

          <label className="field">
            <span>{transactionsCopy(locale, 'paidAmount')}</span>
            <input
              min="0"
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="0.00"
              required
              step="0.01"
              type="number"
              value={paidAmount}
            />
          </label>
        </div>

        {Number(paidAmount) > 0 && (
          <label className="field">
            <span>{transactionsCopy(locale, 'paymentAccount')}</span>
            {accounts.length === 0 ? (
              <p className="form-error">{transactionsCopy(locale, 'noPaymentAccount')}</p>
            ) : (
              <select onChange={(e) => setSelectedAccountId(e.target.value)} value={selectedAccountId}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.balance.toFixed(2)})
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        <div className="field-pair">
          <label className="field">
            <span>{transactionsCopy(locale, 'person')}</span>
            <select onChange={(e) => setPersonId(e.target.value)} value={personId}>
              <option value="">{transactionsCopy(locale, 'selectPerson')}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{transactionsCopy(locale, 'item')}</span>
            <select onChange={(e) => setItemId(e.target.value)} value={itemId}>
              <option value="">{transactionsCopy(locale, 'selectItem')}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>{transactionsCopy(locale, 'note')}</span>
          <input
            onChange={(e) => setNote(e.target.value)}
            placeholder={transactionsCopy(locale, 'noteHint')}
            value={note}
          />
        </label>

        <footer className="form-footer">
          <Button onClick={onClose}>{transactionsCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} type="submit" variant="primary">
            {transactionsCopy(locale, 'saveTransaction')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}

function TransferEditor({ accounts, locale, onClose, onSave }: Readonly<{
  accounts: readonly AccountDefinition[];
  locale: Locale;
  onClose: () => void;
  onSave: (draft: TransferDraft) => Promise<string | undefined>;
}>) {
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [providerFee, setProviderFee] = useState('0');
  const [serviceFee, setServiceFee] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const nextError = await onSave({
      amount: Number(amount),
      fromAccountId,
      note: note.trim() || undefined,
      providerFee: Number(providerFee) || 0,
      serviceFee: Number(serviceFee) || 0,
      toAccountId,
    });
    setError(nextError);
    setSaving(false);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="transfer-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div><p className="eyebrow">MAX · {transactionsCopy(locale, 'transaction')}</p><h2 id="transfer-dialog-title">{locale === 'ar' ? 'تحويل بين الحسابات' : 'Account transfer'}</h2></div>
        <button aria-label={transactionsCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button"><X aria-hidden="true" size={19} /></button>
      </header>
      <form className="object-form" onSubmit={(event) => void submit(event)}>
        {accounts.length < 2 && <p className="form-error" role="alert">{locale === 'ar' ? 'أنشئ حسابين على الأقل لإجراء تحويل.' : 'Create at least two accounts to make a transfer.'}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="field-pair">
          <label className="field"><span>{locale === 'ar' ? 'من حساب' : 'From account'}</span><select onChange={(event) => { const id = event.target.value; setFromAccountId(id); const account = accounts.find((candidate) => candidate.id === id); setProviderFee(String(calculateFee(Number(amount) || 0, account?.feeConfig))); }} value={fromAccountId}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.balance.toFixed(2)})</option>)}</select></label>
          <label className="field"><span>{locale === 'ar' ? 'إلى حساب' : 'To account'}</span><select onChange={(event) => setToAccountId(event.target.value)} value={toAccountId}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.balance.toFixed(2)})</option>)}</select></label>
        </div>
        <label className="field"><span>{transactionsCopy(locale, 'totalAmount')}</span><input data-autofocus="true" min="0.01" onChange={(event) => { const value = event.target.value; setAmount(value); const account = accounts.find((candidate) => candidate.id === fromAccountId); setProviderFee(String(calculateFee(Number(value) || 0, account?.feeConfig))); }} placeholder="0.00" required step="0.01" type="number" value={amount} /></label>
        <div className="field-pair">
          <label className="field"><span>{transactionsCopy(locale, 'providerFee')}</span><input min="0" onChange={(event) => setProviderFee(event.target.value)} step="0.01" type="number" value={providerFee} /></label>
          <label className="field"><span>{transactionsCopy(locale, 'serviceFee')}</span><input min="0" onChange={(event) => setServiceFee(event.target.value)} step="0.01" type="number" value={serviceFee} /></label>
        </div>
        <div className="transfer-fee-breakdown">
          <div className="fee-row"><span>{transactionsCopy(locale, 'transferSourceDebit')}:</span><strong>{((Number(amount) || 0) + (Number(providerFee) || 0)).toFixed(2)}</strong></div>
          <div className="fee-row fee-row--total"><span>{transactionsCopy(locale, 'transferDestinationCredit')}:</span><strong>{((Number(amount) || 0) + (Number(serviceFee) || 0)).toFixed(2)}</strong></div>
        </div>
        <label className="field"><span>{transactionsCopy(locale, 'note')}</span><input onChange={(event) => setNote(event.target.value)} placeholder={locale === 'ar' ? 'مثال: تحويل من الخزنة إلى البنك' : 'e.g., Cash drawer deposit to bank'} value={note} /></label>
        <footer className="form-footer"><Button onClick={onClose}>{transactionsCopy(locale, 'cancel')}</Button><Button disabled={saving || accounts.length < 2} type="submit" variant="primary">{locale === 'ar' ? 'تسجيل التحويل' : 'Record transfer'}</Button></footer>
      </form>
    </FocusedOverlay>
  );
}

export function TransactionsWorkspace({ createRequest, locale, refreshRequest = 0, requestedCreateType }: TransactionsWorkspaceProps) {
  const [transactions, setTransactions] = useState<readonly TransactionRecord[]>([]);
  const [summary, setSummary] = useState<LedgerSummary>();
  const [accounts, setAccounts] = useState<readonly AccountDefinition[]>([]);
  const [people, setPeople] = useState<readonly ConfigurableRecord[]>([]);
  const [items, setItems] = useState<readonly ConfigurableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitialType, setEditorInitialType] = useState<Exclude<TransactionType, 'reversal' | 'transfer'>>('sale');
  const [transferOpen, setTransferOpen] = useState(false);
  const [reversalTarget, setReversalTarget] = useState<TransactionRecord>();
  const [reversalReason, setReversalReason] = useState('');
  const [detailTarget, setDetailTarget] = useState<TransactionRecord>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txList, ledgerSum, accList, pList, iList] = await Promise.all([
        window.maxApi.transactions.list(),
        window.maxApi.transactions.getSummary(),
        window.maxApi.accounts.list(),
        window.maxApi.objects.listRecords('person'),
        window.maxApi.objects.listRecords('item'),
      ]);
      setTransactions(txList);
      setSummary(ledgerSum);
      setAccounts(accList);
      setPeople(pList);
      setItems(iList);
    } catch {
      setError('Could not load transactions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshRequest]);

  const lastHandledCreateRef = useRef(createRequest);
  useEffect(() => {
    if (createRequest > lastHandledCreateRef.current) {
      lastHandledCreateRef.current = createRequest;
      if (requestedCreateType === 'transfer') {
        setTransferOpen(true);
      } else {
        setEditorInitialType(requestedCreateType ?? 'sale');
        setEditorOpen(true);
      }
    }
  }, [createRequest, requestedCreateType]);

  async function handleSaveTransaction(draft: TransactionDraft): Promise<string | undefined> {
    const res = await window.maxApi.transactions.create(draft);
    if (res.ok) {
      setEditorOpen(false);
      await load();
      return undefined;
    }
    return res.error.message;
  }

  async function handleSaveTransfer(draft: TransferDraft): Promise<string | undefined> {
    const res = await window.maxApi.transactions.createTransfer(draft);
    if (res.ok) {
      setTransferOpen(false);
      await load();
      return undefined;
    }
    return res.error.message;
  }

  async function handleReverse() {
    if (!reversalTarget) return;
    const res = await window.maxApi.transactions.reverse(reversalTarget.id, reversalReason);
    if (res.ok) {
      setReversalTarget(undefined);
      setReversalReason('');
      await load();
    } else {
      setError(res.error.message);
    }
  }

  async function handleUndo(id: string) {
    const res = await window.maxApi.transactions.undo(id);
    if (res.ok) {
      await load();
    } else {
      setError(res.error.message);
    }
  }

  return (
    <section className="object-workspace">
      {/* SUMMARY BAR */}
      {summary && (
        <div className="ledger-summary-grid">
          <div className="summary-stat-card">
            <div className="summary-stat-card__icon" style={{ color: 'var(--accent)' }}>
              <Wallet aria-hidden="true" size={20} />
            </div>
            <div>
              <small>{transactionsCopy(locale, 'totalOverall')}</small>
              <strong>{summary.totalOverall.toFixed(2)}</strong>
            </div>
          </div>

          <div className="summary-stat-card">
            <div className="summary-stat-card__icon" style={{ color: 'var(--accent-bright)' }}>
              <Coins aria-hidden="true" size={20} />
            </div>
            <div>
              <small>{transactionsCopy(locale, 'totalCash')}</small>
              <strong>{summary.totalCash.toFixed(2)}</strong>
            </div>
          </div>

          <div className="summary-stat-card">
            <div className="summary-stat-card__icon" style={{ color: 'var(--info)' }}>
              <Landmark aria-hidden="true" size={20} />
            </div>
            <div>
              <small>{transactionsCopy(locale, 'totalBank')}</small>
              <strong>{summary.totalBank.toFixed(2)}</strong>
            </div>
          </div>

          <div className="summary-stat-card">
            <div className="summary-stat-card__icon" style={{ color: 'var(--purple)' }}>
              <Smartphone aria-hidden="true" size={20} />
            </div>
            <div>
              <small>{transactionsCopy(locale, 'totalWallet')}</small>
              <strong>{summary.totalWallet.toFixed(2)}</strong>
            </div>
          </div>

          <div className="summary-stat-card">
            <div className="summary-stat-card__icon" style={{ color: 'var(--success)' }}>
              <TrendingUp aria-hidden="true" size={20} />
            </div>
            <div>
              <small>{transactionsCopy(locale, 'totalSales')}</small>
              <strong>{summary.totalSales.toFixed(2)}</strong>
            </div>
          </div>

          <div className="summary-stat-card">
            <div className="summary-stat-card__icon" style={{ color: 'var(--danger)' }}>
              <TrendingDown aria-hidden="true" size={20} />
            </div>
            <div>
              <small>{transactionsCopy(locale, 'totalExpenses')}</small>
              <strong>{summary.totalExpenses.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="object-toolbar">
        <div>
          <strong>
            {transactions.length} {transactionsCopy(locale, 'transactions')}
          </strong>
        </div>
        <Button
          icon={<Plus aria-hidden="true" size={17} />}
          onClick={() => { setEditorInitialType('sale'); setEditorOpen(true); }}
          variant="primary"
        >
          {transactionsCopy(locale, 'createTransaction')}
        </Button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="transactions-feed" aria-busy={loading}>
        {!loading && transactions.length === 0 && (
          <div className="object-empty">
            <div className="empty-state__icon">
              <Receipt aria-hidden="true" size={25} />
            </div>
            <h2>{transactionsCopy(locale, 'emptyTransactions')}</h2>
            <p>{transactionsCopy(locale, 'emptyTransactionsBody')}</p>
            <Button onClick={() => { setEditorInitialType('sale'); setEditorOpen(true); }} variant="primary">
              {transactionsCopy(locale, 'createTransaction')}
            </Button>
          </div>
        )}

        <div className="transaction-list">
          {transactions.map((tx) => {
            const isReversed = Boolean(tx.reversedAt);
            const isReversal = tx.transactionType === 'reversal';

            return (
              <article
                className={`transaction-card ${isReversed ? 'transaction-card--reversed' : ''}`}
                key={tx.id}
              >
                <div className="transaction-card__main">
                  <div className="transaction-card__header-line">
                    <div className="transaction-card__badges">
                      {typeBadge(tx.transactionType, locale)}
                      {statusBadge(tx.paymentStatus, isReversed, locale)}
                    </div>
                    <time dateTime={tx.createdAt}>
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                        new Date(tx.createdAt),
                      )}
                    </time>
                  </div>

                  <div className="transaction-card__body-line">
                    <div>
                      {tx.note && <strong className="transaction-card__note">{tx.note}</strong>}
                      <div className="transaction-card__tags">
                        {tx.personLabel && (
                          <span className="tag">
                            <ContactRound aria-hidden="true" size={12} strokeWidth={1.8} /> {tx.personLabel}
                          </span>
                        )}
                        {tx.itemLabel && (
                          <span className="tag">
                            <Package aria-hidden="true" size={12} strokeWidth={1.8} /> {tx.itemLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="transaction-card__amounts">
                      <div className="transaction-card__total">{tx.totalAmount.toFixed(2)}</div>
                      {tx.paidAmount !== tx.totalAmount && (
                        <small className="transaction-card__paid">
                          {transactionsCopy(locale, 'paid')}: {tx.paidAmount.toFixed(2)}
                        </small>
                      )}
                    </div>
                  </div>

                  {tx.movements.length > 0 && (
                    <div className="transaction-card__movements">
                      {tx.movements.map((m) => (
                        <span
                          key={m.id}
                          className={`movement-chip ${m.movementType === 'inflow' ? 'movement-chip--in' : 'movement-chip--out'}`}
                        >
                          {m.movementType === 'inflow' ? (
                            <ArrowDownLeft aria-hidden="true" size={13} />
                          ) : (
                            <ArrowUpRight aria-hidden="true" size={13} />
                          )}
                          {m.accountName ?? 'Account'} {m.movementType === 'inflow' ? '+' : '-'}
                          {m.amount.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="transaction-card__actions">
                  <button
                    aria-label={transactionsCopy(locale, 'transactionDetails')}
                    className="icon-button"
                    onClick={() => setDetailTarget(tx)}
                    type="button"
                  >
                    <History aria-hidden="true" size={16} />
                  </button>

                  {!isReversed && !isReversal && (
                    <>
                      <button
                        aria-label={transactionsCopy(locale, 'reverse')}
                        className="icon-button icon-button--warning"
                        onClick={() => setReversalTarget(tx)}
                        title={transactionsCopy(locale, 'reverseTransaction')}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" size={16} />
                      </button>
                      <button
                        aria-label={transactionsCopy(locale, 'undo')}
                        className="icon-button"
                        onClick={() => void handleUndo(tx.id)}
                        title={transactionsCopy(locale, 'undo')}
                        type="button"
                      >
                        <Undo2 aria-hidden="true" size={16} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {editorOpen && (
        <TransactionEditor
          accounts={accounts}
          initialType={editorInitialType}
          items={items}
          locale={locale}
          onClose={() => setEditorOpen(false)}
          onSave={handleSaveTransaction}
          people={people}
        />
      )}

      {transferOpen && (
        <TransferEditor accounts={accounts} locale={locale} onClose={() => setTransferOpen(false)} onSave={handleSaveTransfer} />
      )}

      {/* REVERSAL CONFIRM DIALOG */}
      {reversalTarget && (
        <FocusedOverlay className="confirm-dialog" labelId="reversal-dialog-title" onClose={() => setReversalTarget(undefined)}>
          <div className="scope-dialog__icon">
            <RotateCcw aria-hidden="true" size={22} />
          </div>
          <h2 id="reversal-dialog-title">{transactionsCopy(locale, 'reverseTransaction')}</h2>
          <strong>
            {reversalTarget.note || `Transaction ${reversalTarget.id.slice(0, 8)}`} · {reversalTarget.totalAmount.toFixed(2)}
          </strong>
          <p>{transactionsCopy(locale, 'reversalBody')}</p>

          <label className="field" style={{ margin: '14px 0' }}>
            <span>{transactionsCopy(locale, 'reversalReason')}</span>
            <input
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder={transactionsCopy(locale, 'reversalReasonHint')}
              value={reversalReason}
            />
          </label>

          <div className="confirm-dialog__actions">
            <Button onClick={() => setReversalTarget(undefined)}>{transactionsCopy(locale, 'cancel')}</Button>
            <Button onClick={() => void handleReverse()} variant="consequential">
              {transactionsCopy(locale, 'reverse')}
            </Button>
          </div>
        </FocusedOverlay>
      )}

      {/* DETAIL DIALOG */}
      {detailTarget && (
        <FocusedOverlay className="object-dialog" labelId="detail-dialog-title" onClose={() => setDetailTarget(undefined)}>
          <header className="dialog-header">
            <div>
              <p className="eyebrow">MAX · {transactionsCopy(locale, 'transaction')}</p>
              <h2 id="detail-dialog-title">{transactionsCopy(locale, 'transactionDetails')}</h2>
            </div>
            <button aria-label={transactionsCopy(locale, 'cancel')} className="icon-button" onClick={() => setDetailTarget(undefined)} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </header>

          <div className="transaction-detail-content">
            <div className="detail-row">
              <span>{transactionsCopy(locale, 'transactionType')}</span>
              <strong>{typeBadge(detailTarget.transactionType, locale)}</strong>
            </div>
            <div className="detail-row">
              <span>{transactionsCopy(locale, 'paymentStatus')}</span>
              <strong>{statusBadge(detailTarget.paymentStatus, Boolean(detailTarget.reversedAt), locale)}</strong>
            </div>
            <div className="detail-row">
              <span>{transactionsCopy(locale, 'totalAmount')}</span>
              <strong>{detailTarget.totalAmount.toFixed(2)}</strong>
            </div>
            <div className="detail-row">
              <span>{transactionsCopy(locale, 'paidAmount')}</span>
              <strong>{detailTarget.paidAmount.toFixed(2)}</strong>
            </div>
            {detailTarget.note && (
              <div className="detail-row">
                <span>{transactionsCopy(locale, 'note')}</span>
                <span>{detailTarget.note}</span>
              </div>
            )}
            {detailTarget.personLabel && (
              <div className="detail-row">
                <span>{transactionsCopy(locale, 'person')}</span>
                <span>{detailTarget.personLabel}</span>
              </div>
            )}
            {detailTarget.itemLabel && (
              <div className="detail-row">
                <span>{transactionsCopy(locale, 'item')}</span>
                <span>{detailTarget.itemLabel}</span>
              </div>
            )}

            <div className="movements-breakdown">
              <strong>{transactionsCopy(locale, 'moneyMovements')}</strong>
              {detailTarget.movements.length === 0 ? (
                <p className="schema-empty__text">{transactionsCopy(locale, 'noMovements')}</p>
              ) : (
                <div className="movement-list">
                  {detailTarget.movements.map((m) => (
                    <div key={m.id} className="movement-row">
                      <div className="movement-row__left">
                        {m.movementType === 'inflow' ? (
                          <ArrowDownLeft aria-hidden="true" size={16} style={{ color: 'var(--success)' }} />
                        ) : (
                          <ArrowUpRight aria-hidden="true" size={16} style={{ color: 'var(--danger)' }} />
                        )}
                        <span>{m.accountName ?? 'Account'}</span>
                      </div>
                      <strong style={{ color: m.movementType === 'inflow' ? 'var(--success)' : 'var(--danger)' }}>
                        {m.movementType === 'inflow' ? '+' : '-'}
                        {m.amount.toFixed(2)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <footer className="dialog-footer">
            <Button onClick={() => setDetailTarget(undefined)} variant="primary">
              Close
            </Button>
          </footer>
        </FocusedOverlay>
      )}
    </section>
  );
}
