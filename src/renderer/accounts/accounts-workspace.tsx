import {
  Archive,
  ArrowRightLeft,
  Coins,
  Edit3,
  Landmark,
  Plus,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { calculateFee, type AccountDefinition, type AccountDraft, type AccountType, type FeeType } from '../../shared/account-contract';
import type { TransferDraft } from '../../shared/transaction-contract';
import type { PricingProvider } from '../../shared/pricing-contract';
import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { FocusedOverlay } from '../ui/focused-overlay';
import { accountsCopy } from './accounts-i18n';

type AccountsWorkspaceProps = Readonly<{
  createRequest: number;
  locale: Locale;
  refreshRequest?: number;
}>;

function typeIcon(type: AccountType) {
  switch (type) {
    case 'cash':
      return <Coins aria-hidden="true" size={20} />;
    case 'bank':
      return <Landmark aria-hidden="true" size={20} />;
    case 'wallet':
      return <Smartphone aria-hidden="true" size={20} />;
    default:
      return <Wallet aria-hidden="true" size={20} />;
  }
}

function AccountEditor({
  initial,
  locale,
  onClose,
  onSave,
  providers,
}: Readonly<{
  initial?: AccountDefinition;
  locale: Locale;
  onClose: () => void;
  onSave: (draft: AccountDraft) => Promise<string | undefined>;
  providers: readonly PricingProvider[];
}>) {
  const [name, setName] = useState(initial?.name ?? '');
  const [accountType, setAccountType] = useState<AccountType>(initial?.accountType ?? 'cash');
  const [initialBalance, setInitialBalance] = useState(initial ? String(initial.initialBalance) : '0');
  const [feeType, setFeeType] = useState<FeeType>(initial?.feeConfig?.feeType ?? 'none');
  const [fixedAmount, setFixedAmount] = useState(initial?.feeConfig?.fixedAmount?.toString() ?? '');
  const [percentage, setPercentage] = useState(initial?.feeConfig?.percentage?.toString() ?? '');
  const [minFee, setMinFee] = useState(initial?.feeConfig?.minFee?.toString() ?? '');
  const [maxFee, setMaxFee] = useState(initial?.feeConfig?.maxFee?.toString() ?? '');
  const [providerId, setProviderId] = useState(initial?.providerId ?? '');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const balanceNum = Number(initialBalance);
    if (!Number.isFinite(balanceNum) || balanceNum < 0) {
      setError(accountsCopy(locale, 'initialBalanceHint'));
      setSaving(false);
      return;
    }

    const nextError = await onSave({
      accountType,
      feeConfig: feeType === 'none' ? undefined : {
        feeType,
        fixedAmount: fixedAmount === '' ? undefined : Number(fixedAmount),
        maxFee: maxFee === '' ? undefined : Number(maxFee),
        minFee: minFee === '' ? undefined : Number(minFee),
        percentage: percentage === '' ? undefined : Number(percentage),
      },
      initialBalance: balanceNum,
      name,
      providerId: providerId || undefined,
    });
    setSaving(false);
    setError(nextError);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="account-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {accountsCopy(locale, 'account')}</p>
          <h2 id="account-dialog-title">
            {initial ? accountsCopy(locale, 'editAccount') : accountsCopy(locale, 'addAccount')}
          </h2>
        </div>
        <button aria-label={accountsCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
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
          <span>{accountsCopy(locale, 'accountName')}</span>
          <input
            data-autofocus="true"
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder={accountsCopy(locale, 'accountNameHint')}
            required
            value={name}
          />
        </label>

        <label className="field">
          <span>{accountsCopy(locale, 'provider')}</span>
          <select onChange={(event) => setProviderId(event.target.value)} value={providerId}>
            <option value="">{accountsCopy(locale, 'noProvider')}</option>
            {providers.filter((provider) => provider.active).map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{accountsCopy(locale, 'accountType')}</span>
          <select onChange={(e) => setAccountType(e.target.value as AccountType)} value={accountType}>
            <option value="cash">{accountsCopy(locale, 'cash')}</option>
            <option value="bank">{accountsCopy(locale, 'bank')}</option>
            <option value="wallet">{accountsCopy(locale, 'wallet')}</option>
            <option value="other">{accountsCopy(locale, 'other')}</option>
          </select>
        </label>

        {!initial && (
          <label className="field">
            <span>{accountsCopy(locale, 'initialBalance')}</span>
            <input
              min="0"
              onChange={(e) => setInitialBalance(e.target.value)}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={initialBalance}
            />
            <span className="field-hint">{accountsCopy(locale, 'initialBalanceHint')}</span>
          </label>
        )}

        <div className="quick-step-block">
          <label className="field">
            <span>{accountsCopy(locale, 'feeSettings')}</span>
            <select onChange={(event) => setFeeType(event.target.value as FeeType)} value={feeType}>
              <option value="none">{accountsCopy(locale, 'feeNone')}</option>
              <option value="fixed">{accountsCopy(locale, 'feeFixed')}</option>
              <option value="percentage">{accountsCopy(locale, 'feePercentage')}</option>
              <option value="fixed_plus_percentage">{accountsCopy(locale, 'feeFixedPlusPercentage')}</option>
            </select>
          </label>
          {feeType !== 'none' && (
            <div className="field-pair">
              {(feeType === 'fixed' || feeType === 'fixed_plus_percentage') && (
                <label className="field"><span>{accountsCopy(locale, 'feeFixed')}</span><input min="0" onChange={(event) => setFixedAmount(event.target.value)} step="0.01" type="number" value={fixedAmount} /></label>
              )}
              {(feeType === 'percentage' || feeType === 'fixed_plus_percentage') && (
                <label className="field"><span>{accountsCopy(locale, 'feePercentageValue')}</span><input max="100" min="0" onChange={(event) => setPercentage(event.target.value)} step="0.01" type="number" value={percentage} /></label>
              )}
              <label className="field"><span>{accountsCopy(locale, 'feeMinimum')}</span><input min="0" onChange={(event) => setMinFee(event.target.value)} step="0.01" type="number" value={minFee} /></label>
              <label className="field"><span>{accountsCopy(locale, 'feeMaximum')}</span><input min="0" onChange={(event) => setMaxFee(event.target.value)} step="0.01" type="number" value={maxFee} /></label>
            </div>
          )}
        </div>

        <footer className="form-footer">
          <Button onClick={onClose}>{accountsCopy(locale, 'cancel')}</Button>
          <Button disabled={saving} type="submit" variant="primary">
            {accountsCopy(locale, 'save')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}

function TransferDialog({
  accounts,
  locale,
  onClose,
  onTransfer,
}: Readonly<{
  accounts: readonly AccountDefinition[];
  locale: Locale;
  onClose: () => void;
  onTransfer: (draft: TransferDraft) => Promise<string | undefined>;
}>) {
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [providerFee, setProviderFee] = useState('0');
  const [serviceFee, setServiceFee] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [transferring, setTransferring] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTransferring(true);
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError(locale === 'ar' ? 'أدخل مبلغًا أكبر من الصفر.' : 'Enter an amount greater than zero.');
      setTransferring(false);
      return;
    }
    if (fromAccountId === toAccountId) {
      setError(locale === 'ar' ? 'يجب أن يختلف حساب المصدر عن حساب الوجهة.' : 'Source and destination accounts must be different.');
      setTransferring(false);
      return;
    }

    const nextError = await onTransfer({
      amount: amountNum,
      fromAccountId,
      note: note.trim() || undefined,
      providerFee: Number(providerFee) || 0,
      serviceFee: Number(serviceFee) || 0,
      toAccountId,
    });
    setTransferring(false);
    setError(nextError);
  }

  return (
    <FocusedOverlay className="object-dialog" labelId="transfer-dialog-title" onClose={onClose}>
      <header className="dialog-header">
        <div>
          <p className="eyebrow">MAX · {accountsCopy(locale, 'transfer')}</p>
          <h2 id="transfer-dialog-title">{accountsCopy(locale, 'transferTitle')}</h2>
          <p className="step-subtitle">{accountsCopy(locale, 'transferSubtitle')}</p>
        </div>
        <button aria-label={accountsCopy(locale, 'cancel')} className="icon-button" onClick={onClose} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>

      <form className="object-form" onSubmit={(e) => void submit(e)}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="field-pair">
          <label className="field">
            <span>{accountsCopy(locale, 'fromAccount')}</span>
            <select onChange={(e) => { const id = e.target.value; setFromAccountId(id); const account = accounts.find((candidate) => candidate.id === id); setProviderFee(String(calculateFee(Number(amount) || 0, account?.feeConfig))); }} value={fromAccountId}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.balance.toFixed(2)})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{accountsCopy(locale, 'toAccount')}</span>
            <select onChange={(e) => setToAccountId(e.target.value)} value={toAccountId}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.balance.toFixed(2)})
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>{accountsCopy(locale, 'transferAmount')}</span>
          <input
            data-autofocus="true"
            min="0.01"
            onChange={(e) => { const value = e.target.value; setAmount(value); const account = accounts.find((candidate) => candidate.id === fromAccountId); setProviderFee(String(calculateFee(Number(value) || 0, account?.feeConfig))); }}
            placeholder="0.00"
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </label>

        <div className="field-pair">
          <label className="field"><span>{accountsCopy(locale, 'providerFee')}</span><input min="0" onChange={(event) => setProviderFee(event.target.value)} step="0.01" type="number" value={providerFee} /></label>
          <label className="field"><span>{accountsCopy(locale, 'serviceFee')}</span><input min="0" onChange={(event) => setServiceFee(event.target.value)} step="0.01" type="number" value={serviceFee} /></label>
        </div>
        <div className="transfer-fee-breakdown">
          <div className="fee-row"><span>{accountsCopy(locale, 'transferSourceDebit')}:</span><strong>{((Number(amount) || 0) + (Number(providerFee) || 0)).toFixed(2)}</strong></div>
          <div className="fee-row fee-row--total"><span>{accountsCopy(locale, 'transferDestinationCredit')}:</span><strong>{((Number(amount) || 0) + (Number(serviceFee) || 0)).toFixed(2)}</strong></div>
        </div>

        <label className="field">
          <span>{accountsCopy(locale, 'transferNote')}</span>
          <input
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g., Daily cash deposit to bank"
            value={note}
          />
        </label>

        <footer className="form-footer">
          <Button onClick={onClose}>{accountsCopy(locale, 'cancel')}</Button>
          <Button disabled={transferring} type="submit" variant="primary">
            {accountsCopy(locale, 'transfer')}
          </Button>
        </footer>
      </form>
    </FocusedOverlay>
  );
}

export function AccountsWorkspace({ createRequest, locale, refreshRequest = 0 }: AccountsWorkspaceProps) {
  const [accounts, setAccounts] = useState<readonly AccountDefinition[]>([]);
  const [providers, setProviders] = useState<readonly PricingProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountEditor, setAccountEditor] = useState<AccountDefinition | 'new'>();
  const [transferOpen, setTransferOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AccountDefinition>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, providerList] = await Promise.all([window.maxApi.accounts.list(), window.maxApi.pricing.providers.list()]);
      setAccounts(list);
      setProviders(providerList);
    } catch {
      setError('Could not load accounts.');
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
      setAccountEditor('new');
    }
  }, [createRequest]);

  async function handleSaveAccount(draft: AccountDraft): Promise<string | undefined> {
    const res =
      accountEditor === 'new'
        ? await window.maxApi.accounts.create(draft)
        : await window.maxApi.accounts.update(accountEditor?.id ?? '', draft);

    if (res.ok) {
      setAccountEditor(undefined);
      await load();
      return undefined;
    }
    return res.error.message;
  }

  async function handleTransfer(draft: TransferDraft): Promise<string | undefined> {
    const res = await window.maxApi.transactions.createTransfer(draft);
    if (res.ok) {
      setTransferOpen(false);
      await load();
      return undefined;
    }
    return res.error.message;
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    const res = await window.maxApi.accounts.archive(archiveTarget.id);
    if (res.ok) {
      setArchiveTarget(undefined);
      await load();
    } else {
      setError(res.error.message);
    }
  }

  const totalLiquid = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <section className="object-workspace">
      <div className="object-toolbar">
        <div>
          <strong>
            {accounts.length} {accountsCopy(locale, 'accounts')}
          </strong>
          <span>
            {accountsCopy(locale, 'totalBalance')}:{' '}
            <strong style={{ color: 'var(--accent)' }}>{totalLiquid.toFixed(2)}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {accounts.length >= 2 && (
            <Button
              icon={<ArrowRightLeft aria-hidden="true" size={16} />}
              onClick={() => setTransferOpen(true)}
            >
              {accountsCopy(locale, 'transfer')}
            </Button>
          )}
          <Button
            icon={<Plus aria-hidden="true" size={17} />}
            onClick={() => setAccountEditor('new')}
            variant="primary"
          >
            {accountsCopy(locale, 'addAccount')}
          </Button>
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="accounts-layout" aria-busy={loading}>
        {!loading && accounts.length === 0 && (
          <div className="object-empty">
            <div className="empty-state__icon">
              <Wallet aria-hidden="true" size={25} />
            </div>
            <h2>{accountsCopy(locale, 'emptyAccounts')}</h2>
            <p>{accountsCopy(locale, 'emptyAccountsBody')}</p>
            <Button onClick={() => setAccountEditor('new')} variant="primary">
              {accountsCopy(locale, 'createFirstAccount')}
            </Button>
          </div>
        )}

        <div className="accounts-grid">
          {accounts.map((account) => (
            <article className="account-card" key={account.id}>
              <div className="account-card__head">
                <div className="account-card__icon-title">
                  <div className="account-card__icon">{typeIcon(account.accountType)}</div>
                  <div>
                    <span className="account-card__type">{accountsCopy(locale, account.accountType)}</span>
                    <h2>{account.name}</h2>
                  </div>
                </div>
                <div className="account-card__actions">
                  <button
                    aria-label={`${accountsCopy(locale, 'editAccount')}: ${account.name}`}
                    className="icon-button"
                    onClick={() => setAccountEditor(account)}
                    type="button"
                  >
                    <Edit3 aria-hidden="true" size={16} />
                  </button>
                  <button
                    aria-label={`${accountsCopy(locale, 'archive')}: ${account.name}`}
                    className="icon-button icon-button--danger"
                    onClick={() => setArchiveTarget(account)}
                    type="button"
                  >
                    <Archive aria-hidden="true" size={16} />
                  </button>
                </div>
              </div>

              <div className="account-card__balance-block">
                <small>{accountsCopy(locale, 'balance')}</small>
                <div className="account-card__balance">{account.balance.toFixed(2)}</div>
              </div>

              <div className="account-card__meta">
                <span>
                  {accountsCopy(locale, 'initialBalance')}: {account.initialBalance.toFixed(2)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>

      {accountEditor && (
        <AccountEditor
          initial={accountEditor === 'new' ? undefined : accountEditor}
          locale={locale}
          onClose={() => setAccountEditor(undefined)}
          onSave={handleSaveAccount}
          providers={providers}
        />
      )}

      {transferOpen && (
        <TransferDialog
          accounts={accounts}
          locale={locale}
          onClose={() => setTransferOpen(false)}
          onTransfer={handleTransfer}
        />
      )}

      {archiveTarget && (
        <FocusedOverlay className="confirm-dialog" labelId="archive-dialog-title" onClose={() => setArchiveTarget(undefined)}>
          <div className="scope-dialog__icon">
            <Archive aria-hidden="true" size={22} />
          </div>
          <h2 id="archive-dialog-title">{accountsCopy(locale, 'archiveAccount')}</h2>
          <strong>{archiveTarget.name}</strong>
          <p>{accountsCopy(locale, 'archiveBody')}</p>
          <div className="confirm-dialog__actions">
            <Button onClick={() => setArchiveTarget(undefined)}>{accountsCopy(locale, 'cancel')}</Button>
            <Button onClick={() => void handleArchive()} variant="consequential">
              {accountsCopy(locale, 'archive')}
            </Button>
          </div>
        </FocusedOverlay>
      )}
    </section>
  );
}
