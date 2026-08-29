import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  History,
  Receipt,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { AccountDefinition } from '../../shared/account-contract';
import type {
  ForgivenessDraft,
  PersonFinancialStatement,
  RepaymentDraft,
} from '../../shared/person-debt-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { peopleDebtCopy } from './people-debt-i18n';

type PersonStatementDialogProps = Readonly<{
  locale: Locale;
  onClose: () => void;
  personId: string;
}>;

function RepaymentModal({
  accounts,
  currentDebt,
  locale,
  onClose,
  onSave,
  personId,
}: Readonly<{
  accounts: readonly AccountDefinition[];
  currentDebt: number;
  locale: Locale;
  onClose: () => void;
  onSave: (draft: RepaymentDraft) => Promise<string | undefined>;
  personId: string;
}>) {
  const [amount, setAmount] = useState(currentDebt > 0 ? String(currentDebt) : '');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Please enter an amount greater than zero.');
      setSaving(false);
      return;
    }
    if (!accountId) {
      setError('Please select a payment account.');
      setSaving(false);
      return;
    }

    const err = await onSave({
      accountId,
      amount: amountNum,
      note: note.trim() || undefined,
      personId,
    });
    setSaving(false);
    setError(err);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="repay-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {peopleDebtCopy(locale, 'receiveRepayment')}</p>
          <h2 id="repay-dialog-title">{peopleDebtCopy(locale, 'receiveRepayment')}</h2>
        </div>
        <button aria-label={peopleDebtCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
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
          <span>{peopleDebtCopy(locale, 'amount')}</span>
          <input
            data-autofocus="true"
            min="0.01"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </label>

        <label className="field">
          <span>{peopleDebtCopy(locale, 'paymentAccount')}</span>
          <select onChange={(e) => setAccountId(e.target.value)} value={accountId}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.balance.toFixed(2)})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{peopleDebtCopy(locale, 'note')}</span>
          <input
            onChange={(e) => setNote(e.target.value)}
            placeholder={peopleDebtCopy(locale, 'noteHint')}
            value={note}
          />
        </label>

        <footer className="form-footer">
          <Button onClick={onClose}>{peopleDebtCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} icon={<Coins aria-hidden="true" size={16} />} type="submit" variant="primary">
            {peopleDebtCopy(locale, 'saveRepayment')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}

function ForgivenessModal({
  currentDebt,
  locale,
  onClose,
  onSave,
  personId,
}: Readonly<{
  currentDebt: number;
  locale: Locale;
  onClose: () => void;
  onSave: (draft: ForgivenessDraft) => Promise<string | undefined>;
  personId: string;
}>) {
  const [amount, setAmount] = useState(currentDebt > 0 ? String(currentDebt) : '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount.');
      setSaving(false);
      return;
    }
    if (!reason.trim()) {
      setError('Please enter a reason for debt forgiveness.');
      setSaving(false);
      return;
    }

    const err = await onSave({
      amount: amountNum,
      personId,
      reason: reason.trim(),
    });
    setSaving(false);
    setError(err);
  }

  return (
    <FocusedOverlay className="confirm-dialog" labelId="forgive-dialog-title" onClose={onClose}>
      <div className="scope-dialog__icon">
        <XCircle aria-hidden="true" size={22} />
      </div>
      <h2 id="forgive-dialog-title">{peopleDebtCopy(locale, 'forgiveDebt')}</h2>
      <p>{peopleDebtCopy(locale, 'forgiveNotice')}</p>

      <form className="object-form" onSubmit={(e) => void submit(e)} style={{ margin: '14px 0', width: '100%' }}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <label className="field">
          <span>{peopleDebtCopy(locale, 'amount')}</span>
          <input
            data-autofocus="true"
            min="0.01"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </label>

        <label className="field">
          <span>{peopleDebtCopy(locale, 'reason')}</span>
          <input
            onChange={(e) => setReason(e.target.value)}
            placeholder={peopleDebtCopy(locale, 'reasonHint')}
            required
            value={reason}
          />
        </label>

        <div className="confirm-dialog__actions" style={{ marginTop: '14px' }}>
          <Button onClick={onClose}>{peopleDebtCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} type="submit" variant="consequential">
            {peopleDebtCopy(locale, 'forgive')}
          </Button>
        </div>
      </form>
    </FocusedOverlay>
  );
}

export function PersonStatementDialog({ locale, onClose, personId }: PersonStatementDialogProps) {
  const [statement, setStatement] = useState<PersonFinancialStatement>();
  const [accounts, setAccounts] = useState<readonly AccountDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [forgivenessOpen, setForgivenessOpen] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stmt, accList] = await Promise.all([
        window.maxApi.people.getStatement(personId),
        window.maxApi.accounts.list(),
      ]);
      setStatement(stmt);
      setAccounts(accList);
    } catch {
      setError('Could not load financial statement.');
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRepayment(draft: RepaymentDraft): Promise<string | undefined> {
    const res = await window.maxApi.people.repayDebt(draft);
    if (res.ok) {
      setRepaymentOpen(false);
      await load();
      return undefined;
    }
    return res.error.message;
  }

  async function handleForgiveness(draft: ForgivenessDraft): Promise<string | undefined> {
    const res = await window.maxApi.people.forgiveDebt(draft);
    if (res.ok) {
      setForgivenessOpen(false);
      await load();
      return undefined;
    }
    return res.error.message;
  }

  return (
    <FocusedOverlay className="object-dialog person-statement-dialog" labelId="statement-title" onClose={onClose}>
      <header className="dialog-header">
        <div className="statement-header-title">
          <div className="statement-avatar">
            <User aria-hidden="true" size={20} />
          </div>
          <div>
            <p className="eyebrow">MAX · {peopleDebtCopy(locale, 'debtStatement')}</p>
            <h2 id="statement-title">{statement?.summary.personLabel ?? 'Person Statement'}</h2>
          </div>
        </div>
        <button aria-label={peopleDebtCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      {error && (
        <p className="form-error" role="alert" style={{ margin: '12px 24px 0' }}>
          {error}
        </p>
      )}

      <div className="statement-body" aria-busy={loading}>
        {/* SUMMARY TILES */}
        {statement && (
          <div className="statement-summary-bar">
            <div className="statement-stat">
              <small>{peopleDebtCopy(locale, 'owesShop')}</small>
              <strong style={{ color: statement.summary.receivable > 0 ? 'var(--danger)' : 'var(--text)' }}>
                {statement.summary.receivable.toFixed(2)}
              </strong>
            </div>

            <div className="statement-stat">
              <small>{peopleDebtCopy(locale, 'shopOwes')}</small>
              <strong style={{ color: statement.summary.payable > 0 ? 'var(--info)' : 'var(--text)' }}>
                {statement.summary.payable.toFixed(2)}
              </strong>
            </div>

            <div className="statement-stat">
              <small>{peopleDebtCopy(locale, 'netBalance')}</small>
              <strong style={{ color: statement.summary.netBalance > 0 ? 'var(--danger)' : statement.summary.netBalance < 0 ? 'var(--info)' : 'var(--success)' }}>
                {statement.summary.netBalance.toFixed(2)}
              </strong>
            </div>

            <div className="statement-actions">
              <Button
                icon={<Coins aria-hidden="true" size={15} />}
                onClick={() => setRepaymentOpen(true)}
                variant="primary"
              >
                {peopleDebtCopy(locale, 'collectPayment')}
              </Button>
              {statement.summary.receivable > 0 && (
                <Button
                  onClick={() => setForgivenessOpen(true)}
                  variant="secondary"
                >
                  {peopleDebtCopy(locale, 'forgive')}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* UNPAID / PARTIAL SALES */}
        <section className="statement-section">
          <div className="statement-section__head">
            <Receipt aria-hidden="true" size={16} />
            <h3>{peopleDebtCopy(locale, 'unpaidSales')}</h3>
          </div>

          {statement?.unpaidTransactions.length === 0 ? (
            <div className="settled-card">
              <CheckCircle2 aria-hidden="true" size={18} style={{ color: 'var(--success)' }} />
              <span>{peopleDebtCopy(locale, 'emptyUnpaid')}</span>
            </div>
          ) : (
            <div className="statement-tx-list">
              {statement?.unpaidTransactions.map((tx) => {
                const unpaidPart = tx.totalAmount - tx.paidAmount;
                return (
                  <div className="statement-tx-item" key={tx.id}>
                    <div>
                      <strong>{tx.note || `Sale #${tx.id.slice(0, 6)}`}</strong>
                      <small>
                        {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                          new Date(tx.createdAt),
                        )}
                      </small>
                    </div>
                    <div className="statement-tx-item__amounts">
                      <span>
                        {peopleDebtCopy(locale, 'totalAmount')}: {tx.totalAmount.toFixed(2)}
                      </span>
                      <strong style={{ color: 'var(--danger)' }}>
                        {peopleDebtCopy(locale, 'remaining')}: {unpaidPart.toFixed(2)}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* TRANSACTION HISTORY */}
        <section className="statement-section">
          <div className="statement-section__head">
            <History aria-hidden="true" size={16} />
            <h3>{peopleDebtCopy(locale, 'history')}</h3>
          </div>

          {statement?.history.length === 0 ? (
            <p className="schema-empty__text">{peopleDebtCopy(locale, 'emptyHistory')}</p>
          ) : (
            <div className="statement-tx-list">
              {statement?.history.map((tx) => (
                <div className="statement-tx-item" key={tx.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {tx.transactionType === 'sale' ? (
                      <ArrowUpRight aria-hidden="true" size={16} style={{ color: 'var(--success)' }} />
                    ) : tx.transactionType === 'income' ? (
                      <ArrowDownLeft aria-hidden="true" size={16} style={{ color: 'var(--info)' }} />
                    ) : (
                      <History aria-hidden="true" size={16} style={{ color: 'var(--purple)' }} />
                    )}
                    <div>
                      <strong>{tx.note || tx.transactionType}</strong>
                      <small>
                        {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                          new Date(tx.createdAt),
                        )}
                      </small>
                    </div>
                  </div>
                  <div className="statement-tx-item__amounts">
                    <strong>{tx.totalAmount.toFixed(2)}</strong>
                    <span className="badge">{tx.paymentStatus}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {repaymentOpen && statement && (
        <RepaymentModal
          accounts={accounts}
          currentDebt={statement.summary.receivable}
          locale={locale}
          onClose={() => setRepaymentOpen(false)}
          onSave={handleRepayment}
          personId={personId}
        />
      )}

      {forgivenessOpen && statement && (
        <ForgivenessModal
          currentDebt={statement.summary.receivable}
          locale={locale}
          onClose={() => setForgivenessOpen(false)}
          onSave={handleForgiveness}
          personId={personId}
        />
      )}
    </FocusedOverlay>
  );
}
