import { useEffect, useState } from 'react';

import type { Locale } from '../../app/i18n';
import type { ChaosApi, ChaosConnectionStatus, ChaosConnectionTest, ChaosError } from '../../../shared/chaos-integration-contract';
import { Button } from '../../ui/button';
import { FocusedOverlay } from '../../ui/focused-overlay';
import { chaosCopy, errorMessage, formatFetchedAt, scopeLabel } from './chaos-copy';
import './chaos.css';

/**
 * Settings → Connections → Chaos.
 *
 * The token is typed or pasted here, sent to the main process for "Test" and
 * "Save", and then cleared from this component. The main process never sends
 * it back, so the form cannot show it again; reconnecting means pasting a
 * token again.
 */
export function ChaosConnectionSettings({ locale }: Readonly<{ locale: Locale }>) {
  const copy = chaosCopy(locale);
  const [status, setStatus] = useState<ChaosConnectionStatus>();
  const [origin, setOrigin] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'disconnect'>();
  const [tested, setTested] = useState<ChaosConnectionTest>();
  const [error, setError] = useState<ChaosError>();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    let active = true;
    // Absent in the browser preview and in shell tests: the section then stays hidden.
    if (!(window.maxApi.chaos as ChaosApi | undefined)) return;
    void window.maxApi.chaos.getStatus().then((next) => {
      if (!active) return;
      setStatus(next);
      if (next.apiOrigin) setOrigin(next.apiOrigin);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function test() {
    setBusy('test'); setError(undefined); setTested(undefined);
    try {
      const result = await window.maxApi.chaos.testConnection(origin, token);
      if (result.ok) setTested(result.value); else setError(result.error);
    } finally { setBusy(undefined); }
  }

  async function save() {
    setBusy('save'); setError(undefined);
    try {
      const result = await window.maxApi.chaos.saveConnection(origin, token);
      if (result.ok) { setStatus(result.value); setToken(''); setTested(undefined); } else setError(result.error);
    } finally { setBusy(undefined); }
  }

  async function disconnect() {
    setBusy('disconnect'); setError(undefined);
    try {
      const result = await window.maxApi.chaos.disconnect();
      if (result.ok) { setStatus(result.value); setConfirmDisconnect(false); } else setError(result.error);
    } finally { setBusy(undefined); }
  }

  if (!status) return null;
  const connected = status.state === 'connected';
  const showForm = !connected;

  return (
    <div className="chaos-settings" data-setting="chaos-connection">
      <div className="apple-settings-row">
        <div className="apple-settings-row-left"><div className="apple-settings-content">
          <span className="apple-settings-title">{copy.connectionsTitle}</span>
          <span className="apple-settings-description">{copy.connectionsDescription}</span>
        </div></div>
        <div className="apple-settings-row-right">
          <span className="chaos-pill" data-state={connected ? 'ok' : 'off'}>{connected ? copy.connected : copy.disconnected}</span>
        </div>
      </div>

      {!status.secureStorageAvailable && <p className="chaos-note chaos-note--warning" role="status">{copy.secureStorageMissing}</p>}
      {status.state === 'needs-token' && <p className="chaos-note chaos-note--warning" role="status">{copy.needsToken}</p>}

      {connected && (
        <dl className="chaos-details" aria-label={copy.connectionsTitle}>
          <dt>{copy.workspace}</dt><dd><bdi>{status.workspaceName}</bdi>{status.connectionLabel ? <> · <bdi>{status.connectionLabel}</bdi></> : null}</dd>
          <dt>{copy.apiOrigin}</dt><dd dir="ltr"><bdi>{status.apiOrigin}</bdi></dd>
          <dt>{copy.access}</dt><dd>{status.access === 'all' ? copy.accessAll : copy.accessSelected}</dd>
          <dt>{copy.scopes}</dt><dd>{status.scopes.length ? status.scopes.map((scope) => scopeLabel(locale, scope)).join(' · ') : '—'}</dd>
          <dt>{copy.test}</dt><dd>{formatFetchedAt(locale, status.lastCheckedAt)}</dd>
        </dl>
      )}

      {showForm && status.secureStorageAvailable && (
        <form className="chaos-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label>
            <span>{copy.apiOrigin}</span>
            <input dir="ltr" inputMode="url" autoComplete="off" spellCheck={false} value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="https://example-123.convex.site" />
            <small>{copy.apiOriginHelp}</small>
          </label>
          <label>
            <span>{copy.token}</span>
            <input dir="ltr" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(event) => setToken(event.target.value)} placeholder="chaos_…" />
            <small>{copy.tokenHelp}</small>
          </label>
          <div className="chaos-actions">
            <Button disabled={!origin.trim() || !token.trim() || !!busy} aria-busy={busy === 'test'} onClick={() => void test()}>{copy.test}</Button>
            <Button type="submit" variant="primary" disabled={!origin.trim() || !token.trim() || !!busy} aria-busy={busy === 'save'}>{copy.connect}</Button>
          </div>
        </form>
      )}

      {tested && (
        <div className="chaos-note" role="status">
          <strong>{copy.testOk}</strong>
          <dl className="chaos-details">
            <dt>{copy.workspace}</dt><dd><bdi>{tested.workspaceName}</bdi>{tested.connectionLabel ? <> · <bdi>{tested.connectionLabel}</bdi></> : null}</dd>
            <dt>{copy.access}</dt><dd>{tested.access === 'all' ? copy.accessAll : copy.accessSelected}</dd>
            <dt>{copy.scopes}</dt><dd>{tested.scopes.length ? tested.scopes.map((scope) => scopeLabel(locale, scope)).join(' · ') : '—'}</dd>
          </dl>
        </div>
      )}

      {error && <p className="form-error" role="alert">{errorMessage(locale, error)}</p>}

      {status.state !== 'none' && status.state !== 'disconnected' && (
        <div className="chaos-actions">
          <Button variant="ghost" disabled={!!busy} onClick={() => setConfirmDisconnect(true)}>{copy.disconnect}</Button>
        </div>
      )}

      {confirmDisconnect && (
        <FocusedOverlay className="settings-delete-dialog" labelId="chaos-disconnect-title" onClose={() => { if (!busy) setConfirmDisconnect(false); }}>
          <h3 id="chaos-disconnect-title">{copy.disconnect}</h3>
          <p>{copy.disconnectBody}</p>
          <button className="settings-delete-confirm" type="button" disabled={!!busy} onClick={() => void disconnect()}>{copy.disconnect}</button>
          <button data-autofocus="true" type="button" disabled={!!busy} onClick={() => setConfirmDisconnect(false)}>{copy.cancel}</button>
        </FocusedOverlay>
      )}
    </div>
  );
}
