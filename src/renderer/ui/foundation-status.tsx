import { useEffect, useState } from 'react';

import type { SystemHealth } from '../../shared/ipc-contract';

type Status =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ health: SystemHealth; kind: 'ready' }>
  | Readonly<{ kind: 'unavailable' }>;

export function FoundationStatus() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let active = true;

    void window.maxApi.system
      .getHealth()
      .then((health) => {
        if (active) setStatus({ health, kind: 'ready' });
      })
      .catch(() => {
        if (active) setStatus({ kind: 'unavailable' });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="foundation">
      <section className="foundation__card" aria-live="polite">
        <div className="foundation__mark" aria-hidden="true">
          M
        </div>
        <p className="foundation__eyebrow">MAX · v0.1.0</p>
        <h1>Foundation</h1>
        {status.kind === 'loading' && <p>Checking the local engine…</p>}
        {status.kind === 'unavailable' && (
          <p className="foundation__problem">The local engine did not start. Restart Max and try again.</p>
        )}
        {status.kind === 'ready' && (
          <>
            <p className="foundation__ready">Local engine ready</p>
            <dl>
              <div>
                <dt>SQLite schema</dt>
                <dd>v{status.health.database.schemaVersion}</dd>
              </div>
              <div>
                <dt>Runtime</dt>
                <dd>
                  {status.health.runtime.platform} · {status.health.runtime.arch}
                </dd>
              </div>
            </dl>
          </>
        )}
        <p className="foundation__note">Shop workflows begin in Sprint 1.</p>
      </section>
    </main>
  );
}
