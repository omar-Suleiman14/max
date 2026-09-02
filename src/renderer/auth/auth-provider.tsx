import { Lock } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';

import type { Locale } from '../app/i18n';
import { AuthContext, useAuth, type AuthContextValue } from './auth-context';
import {
  CLOUD_BACKUP_PREFERENCE_EVENT,
  readCloudBackupEnabled,
} from './cloud-backup-preference';

const publishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim();
const ClerkAuthProvider = lazy(() => import('./clerk-auth-provider').then((module) => ({ default: module.ClerkAuthProvider })));
const ClerkAuthWidget = lazy(() => import('./clerk-auth-provider').then((module) => ({ default: module.ClerkAuthWidget })));

const hasPublishableKey = Boolean(publishableKey && publishableKey !== 'pk_test_placeholder_key');

const offlineValue: AuthContextValue = {
  getToken: () => Promise.resolve(null),
  isAvailable: hasPublishableKey,
  isConfigured: false,
  isSignedIn: false,
};

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const [cloudBackupEnabled, setCloudBackupEnabled] = useState(() => readCloudBackupEnabled(window.localStorage));

  useEffect(() => {
    const handlePreferenceChange = (event: Event) => {
      const enabled = event instanceof CustomEvent && typeof event.detail === 'boolean'
        ? event.detail
        : readCloudBackupEnabled(window.localStorage);
      setCloudBackupEnabled(enabled);
    };
    window.addEventListener(CLOUD_BACKUP_PREFERENCE_EVENT, handlePreferenceChange);
    window.addEventListener('storage', handlePreferenceChange);
    return () => {
      window.removeEventListener(CLOUD_BACKUP_PREFERENCE_EVENT, handlePreferenceChange);
      window.removeEventListener('storage', handlePreferenceChange);
    };
  }, []);

  if (!cloudBackupEnabled || !hasPublishableKey || !publishableKey) {
    return (
      <AuthContext.Provider value={offlineValue}>
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <Suspense fallback={null}>
      <ClerkAuthProvider publishableKey={publishableKey}>{children}</ClerkAuthProvider>
    </Suspense>
  );
}

/** Render Clerk account controls only inside the opt-in cloud-backup settings. */
export function AuthWidget({ locale }: { locale: Locale }) {
  const { isAvailable, isConfigured, isSignedIn, userName, userEmail } = useAuth();

  if (!isAvailable) {
    return (
      <div className="auth-widget auth-widget--offline" title={locale === 'ar' ? 'المصادقة السحابية غير مهيأة' : 'Cloud authentication is not configured'}>
        <Lock size={14} aria-hidden="true" />
        <span>{locale === 'ar' ? 'المصادقة السحابية غير متاحة في هذا الإصدار' : 'Cloud sign-in is unavailable in this build'}</span>
      </div>
    );
  }

  if (!isConfigured) return null;

  return <Suspense fallback={null}><ClerkAuthWidget isSignedIn={isSignedIn} locale={locale} userEmail={userEmail} userName={userName} /></Suspense>;
}
