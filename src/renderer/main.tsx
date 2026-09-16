import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { MaxApp } from './app/max-app';
import { AppAuthProvider } from './auth/auth-provider';
import { CloudBackupScheduler } from './backup/cloud-backup-scheduler';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Max renderer root was not found.');
}

class StartupBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) }; }
  override render() {
    if (this.state.error) return <main style={{ padding: 40, color: 'var(--text)', fontFamily: 'system-ui' }}><h1>Max could not display this page</h1><p role="alert">{this.state.error}</p><button onClick={() => { localStorage.removeItem('max:session:page'); location.reload(); }}>Return to Home</button></main>;
    return this.props.children;
  }
}
/**
 * The authentication provider wraps the whole application because Max Cloud
 * Backup needs a session token in the renderer to hand to the main process.
 * It costs nothing when cloud backup is off: it renders an offline context
 * that returns no token, loads no Clerk code and makes no network request, so
 * Max behaves exactly as before until somebody opts in.
 */
createRoot(root).render(
  <StrictMode>
    <StartupBoundary>
      <AppAuthProvider>
        <CloudBackupScheduler />
        <MaxApp />
      </AppAuthProvider>
    </StartupBoundary>
  </StrictMode>,
);
