import { Select } from '../ui/select';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Lock,
  Plus,
  Scale,
  Unlock,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { AccountDefinition } from '../../shared/account-contract';
import type {
  CloseSessionDraft,
  DailySession,
  OpenSessionDraft,
  SessionExpectedClosing,
} from '../../shared/reconciliation-contract';
import { type Locale, translate } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { reconciliationCopy } from './reconciliation-i18n';

type ReconciliationWorkspaceProps = Readonly<{
  locale: Locale;
}>;

function OpenModal({
  accounts,
  locale,
  onClose,
  onOpen,
}: Readonly<{
  accounts: readonly AccountDefinition[];
  locale: Locale;
  onClose: () => void;
  onOpen: (draft: OpenSessionDraft) => Promise<string | undefined>;
}>) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [openingBalance, setOpeningBalance] = useState(
    accounts[0] ? String(accounts[0].balance) : '0',
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  function handleAccountChange(id: string) {
    setAccountId(id);
    const acc = accounts.find((a) => a.id === id);
    if (acc) setOpeningBalance(String(acc.balance));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const amountNum = Number(openingBalance);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setError('Please enter a valid starting cash balance.');
      setSaving(false);
      return;
    }
    if (!accountId) {
      setError('Please select a drawer account.');
      setSaving(false);
      return;
    }

    const err = await onOpen({
      accountId,
      openingBalance: amountNum,
    });
    setSaving(false);
    setError(err);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="open-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {reconciliationCopy(locale, 'dailyReconciliation')}</p>
          <h2 id="open-dialog-title">{reconciliationCopy(locale, 'openDrawer')}</h2>
        </div>
        <button aria-label={reconciliationCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
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
          <span>{reconciliationCopy(locale, 'registerAccount')}</span>
          <Select onChange={(e) => handleAccountChange(e.target.value)} value={accountId}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.balance.toFixed(2)})
              </option>
            ))}
          </Select>
        </label>

        <label className="field">
          <span>{reconciliationCopy(locale, 'openingCash')}</span>
          <input
            data-autofocus="true"
            min="0"
            onChange={(e) => setOpeningBalance(e.target.value)}
            required
            step="0.01"
            type="number"
            value={openingBalance}
          />
        </label>

        <footer className="form-footer">
          <Button onClick={onClose}>{reconciliationCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} icon={<Unlock aria-hidden="true" size={16} />} type="submit" variant="primary">
            {reconciliationCopy(locale, 'startDay')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}

function CloseModal({
  expected,
  locale,
  onClose,
  onConfirmClose,
  session,
}: Readonly<{
  expected: SessionExpectedClosing;
  locale: Locale;
  onClose: () => void;
  onConfirmClose: (draft: CloseSessionDraft) => Promise<string | undefined>;
  session: DailySession;
}>) {
  const [actualCash, setActualCash] = useState(String(expected.expectedBalance));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const actualNum = Number(actualCash) || 0;
  const discrepancy = Math.round((actualNum - expected.expectedBalance) * 100) / 100;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (!Number.isFinite(actualNum) || actualNum < 0) {
      setError('Please enter a valid counted actual cash amount.');
      setSaving(false);
      return;
    }
    if (discrepancy !== 0 && !note.trim()) {
      setError('An explanation note is required when actual cash differs from expected cash.');
      setSaving(false);
      return;
    }

    const err = await onConfirmClose({
      actualClosingBalance: actualNum,
      discrepancyNote: note.trim() || undefined,
      sessionId: session.id,
    });
    setSaving(false);
    setError(err);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="close-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {reconciliationCopy(locale, 'dailyReconciliation')}</p>
          <h2 id="close-dialog-title">{reconciliationCopy(locale, 'closeDrawer')}</h2>
        </div>
        <button aria-label={reconciliationCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <form className="object-form" onSubmit={(e) => void submit(e)}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="reconciliation-summary-box">
          <div className="summary-col">
            <small>{reconciliationCopy(locale, 'equationOpening')}</small>
            <strong>{expected.openingBalance.toFixed(2)}</strong>
          </div>
          <div className="summary-col">
            <small>{reconciliationCopy(locale, 'equationInflows')}</small>
            <strong style={{ color: 'var(--success)' }}>+{expected.totalInflows.toFixed(2)}</strong>
          </div>
          <div className="summary-col">
            <small>{reconciliationCopy(locale, 'equationExpenses')}</small>
            <strong style={{ color: 'var(--danger)' }}>-{expected.totalOutflows.toFixed(2)}</strong>
          </div>
          <div className="summary-col">
            <small>{reconciliationCopy(locale, 'equationExpected')}</small>
            <strong style={{ color: 'var(--accent)', fontSize: '18px' }}>{expected.expectedBalance.toFixed(2)}</strong>
          </div>
        </div>

        <label className="field">
          <span>{reconciliationCopy(locale, 'actualCash')}</span>
          <input
            data-autofocus="true"
            min="0"
            onChange={(e) => setActualCash(e.target.value)}
            required
            step="0.01"
            type="number"
            value={actualCash}
          />
        </label>

        <div className="discrepancy-indicator">
          {discrepancy === 0 ? (
            <div className="badge badge--success" style={{ padding: '8px 12px', fontSize: '13px', width: '100%' }}>
              <CheckCircle2 aria-hidden="true" size={16} />
              <span>{reconciliationCopy(locale, 'exactMatch')}</span>
            </div>
          ) : (
            <div
              className={`badge ${discrepancy > 0 ? 'badge--info' : 'badge--danger'}`}
              style={{ padding: '8px 12px', fontSize: '13px', width: '100%' }}
            >
              <AlertTriangle aria-hidden="true" size={16} />
              <span>
                {discrepancy > 0 ? reconciliationCopy(locale, 'discrepancySurplus') : reconciliationCopy(locale, 'discrepancyShortage')}:{' '}
                {Math.abs(discrepancy).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {discrepancy !== 0 && (
          <label className="field">
            <span>{reconciliationCopy(locale, 'closingNote')}</span>
            <input
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Cash difference accounted for change discrepancy"
              required
              value={note}
            />
          </label>
        )}

        <footer className="form-footer">
          <Button onClick={onClose}>{reconciliationCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} icon={<Lock aria-hidden="true" size={16} />} type="submit" variant="primary">
            {reconciliationCopy(locale, 'closeSession')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}

export function ReconciliationWorkspace({ locale }: ReconciliationWorkspaceProps) {
  const [currentSession, setCurrentSession] = useState<DailySession | null>(null);
  const [expectedClosing, setExpectedClosing] = useState<SessionExpectedClosing>();
  const [sessions, setSessions] = useState<readonly DailySession[]>([]);
  const [accounts, setAccounts] = useState<readonly AccountDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [error, setError] = useState<string>();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [curr, sList, aList] = await Promise.all([
        window.maxApi.reconciliation.getCurrentSession(),
        window.maxApi.reconciliation.listSessions(),
        window.maxApi.accounts.list(),
      ]);
      setCurrentSession(curr);
      setSessions(sList);
      setAccounts(aList);
      if (curr) {
        const exp = await window.maxApi.reconciliation.getExpectedClosing(curr.id);
        setExpectedClosing(exp);
      } else {
        setExpectedClosing(undefined);
      }
    } catch {
      setError('Could not load reconciliation data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleOpen(draft: OpenSessionDraft): Promise<string | undefined> {
    const res = await window.maxApi.reconciliation.openSession(draft);
    if (res.ok) {
      setOpenModalOpen(false);
      await loadData();
      return undefined;
    }
    return res.error.message;
  }

  async function handleClose(draft: CloseSessionDraft): Promise<string | undefined> {
    const res = await window.maxApi.reconciliation.closeSession(draft);
    if (res.ok) {
      setCloseModalOpen(false);
      await loadData();
      return undefined;
    }
    return res.error.message;
  }

  const activeAccount = accounts.find((a) => a.id === currentSession?.accountId);

  return (
    <div className="reconciliation-workspace">
      <div className="reconciliation-toolbar">
        <div>
          <h2>{reconciliationCopy(locale, 'dailyReconciliation')}</h2>
          <p className="step-subtitle">{reconciliationCopy(locale, 'dailySubtitle')}</p>
        </div>
        {!currentSession ? (
          <Button
            icon={<Unlock aria-hidden="true" size={16} />}
            onClick={() => setOpenModalOpen(true)}
            variant="primary"
          >
            {reconciliationCopy(locale, 'openDrawer')}
          </Button>
        ) : (
          <Button
            icon={<Lock aria-hidden="true" size={16} />}
            onClick={() => setCloseModalOpen(true)}
            variant="primary"
          >
            {reconciliationCopy(locale, 'closeDrawer')}
          </Button>
        )}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {/* ACTIVE DRAWER STATUS CARD */}
      <section className="active-drawer-card" aria-busy={loading}>
        <div className="active-drawer-head">
          <div className="drawer-status-pill" data-open={Boolean(currentSession)}>
            {currentSession ? <Unlock aria-hidden="true" size={16} /> : <Lock aria-hidden="true" size={16} />}
            <strong>{currentSession ? reconciliationCopy(locale, 'statusOpen') : reconciliationCopy(locale, 'statusClosed')}</strong>
          </div>
          {currentSession && activeAccount && (
            <span className="drawer-account-name">
              <Wallet aria-hidden="true" size={15} />
              {activeAccount.name}
            </span>
          )}
        </div>

        {currentSession && expectedClosing ? (
          <div className="equation-grid">
            <div className="equation-box">
              <small>{reconciliationCopy(locale, 'equationOpening')}</small>
              <strong>{expectedClosing.openingBalance.toFixed(2)}</strong>
            </div>
            <div className="equation-op">+</div>
            <div className="equation-box">
              <small>{reconciliationCopy(locale, 'equationInflows')}</small>
              <strong style={{ color: 'var(--success)' }}>+{expectedClosing.totalInflows.toFixed(2)}</strong>
            </div>
            <div className="equation-op">-</div>
            <div className="equation-box">
              <small>{reconciliationCopy(locale, 'equationExpenses')}</small>
              <strong style={{ color: 'var(--danger)' }}>-{expectedClosing.totalOutflows.toFixed(2)}</strong>
            </div>
            <div className="equation-op">=</div>
            <div className="equation-box equation-box--expected">
              <small>{reconciliationCopy(locale, 'equationExpected')}</small>
              <strong>{expectedClosing.expectedBalance.toFixed(2)}</strong>
            </div>
          </div>
        ) : (
          <div className="drawer-closed-banner">
            <p>{translate(locale, 'reconciliationEmptyBody')}</p>
            <Button icon={<Plus aria-hidden="true" size={16} />} onClick={() => setOpenModalOpen(true)} variant="primary">
              {reconciliationCopy(locale, 'openDrawer')}
            </Button>
          </div>
        )}
      </section>

      {/* HISTORICAL SESSIONS TABLE */}
      <section className="reconciliation-history-section">
        <div className="section-title">
          <History aria-hidden="true" size={18} />
          <h3>{reconciliationCopy(locale, 'sessionHistory')}</h3>
        </div>

        {sessions.length === 0 ? (
          <div className="object-empty">
            <Scale aria-hidden="true" size={24} />
            <p>{reconciliationCopy(locale, 'emptySessions')}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{reconciliationCopy(locale, 'status')}</th>
                  <th>{reconciliationCopy(locale, 'openingTime')}</th>
                  <th>{reconciliationCopy(locale, 'openingCash')}</th>
                  <th>{reconciliationCopy(locale, 'equationExpected')}</th>
                  <th>{reconciliationCopy(locale, 'actualCash')}</th>
                  <th>{reconciliationCopy(locale, 'discrepancy')}</th>
                  <th>{reconciliationCopy(locale, 'closingTime')}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const acc = accounts.find((a) => a.id === s.accountId);
                  const isMatch = s.discrepancy === 0;
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className={`badge ${s.status === 'open' ? 'badge--info' : 'badge--muted'}`}>
                          {s.status === 'open' ? reconciliationCopy(locale, 'statusOpen') : reconciliationCopy(locale, 'statusClosed')}
                        </span>
                      </td>
                      <td>
                        <strong>{acc?.name ?? 'Drawer'}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)' }}>
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.openedAt))}
                        </small>
                      </td>
                      <td>{s.openingBalance.toFixed(2)}</td>
                      <td>{s.expectedClosingBalance !== undefined ? s.expectedClosingBalance.toFixed(2) : '—'}</td>
                      <td>{s.actualClosingBalance !== undefined ? s.actualClosingBalance.toFixed(2) : '—'}</td>
                      <td>
                        {s.discrepancy !== undefined ? (
                          <span className={`badge ${isMatch ? 'badge--success' : s.discrepancy > 0 ? 'badge--info' : 'badge--danger'}`}>
                            {s.discrepancy > 0 ? `+${s.discrepancy.toFixed(2)}` : s.discrepancy.toFixed(2)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {s.closedAt
                          ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.closedAt))
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openModalOpen && (
        <OpenModal
          accounts={accounts}
          locale={locale}
          onClose={() => setOpenModalOpen(false)}
          onOpen={handleOpen}
        />
      )}

      {closeModalOpen && currentSession && expectedClosing && (
        <CloseModal
          expected={expectedClosing}
          locale={locale}
          onClose={() => setCloseModalOpen(false)}
          onConfirmClose={handleClose}
          session={currentSession}
        />
      )}
    </div>
  );
}
