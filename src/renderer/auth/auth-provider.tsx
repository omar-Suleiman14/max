import { Lock } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';

import type { Locale } from '../app/i18n';
import { AuthContext, useAuth, type AuthContextValue } from './auth-context';

const publishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim();
const ClerkAuthProvider = lazy(() => import('./clerk-auth-provider').then((module) => ({ default: module.ClerkAuthProvider })));
const ClerkAuthWidget = lazy(() => import('./clerk-auth-provider').then((module) => ({ default: module.ClerkAuthWidget })));

const offlineValue: AuthContextValue = {
  getToken: () => Promise.resolve(null),
  isConfigured: false,
  isSignedIn: false,
};

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey || publishableKey === 'pk_test_placeholder_key') {
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

/** Render Clerk User profile widget or local offline indicator in Sidebar/Settings */
export function AuthWidget({ locale }: { locale: Locale }) {
  const { isConfigured, isSignedIn, userName, userEmail } = useAuth();

  if (!isConfigured) {
    return (
      <div className="auth-widget auth-widget--offline" title={locale === 'ar' ? 'وضع غير متصل بالإنترنت' : 'Offline local-only mode'}>
        <Lock size={14} aria-hidden="true" />
        <span>{locale === 'ar' ? 'محلي دون اتصال' : 'Local offline mode'}</span>
      </div>
    );
  }

  return <Suspense fallback={null}><ClerkAuthWidget isSignedIn={isSignedIn} locale={locale} userEmail={userEmail} userName={userName} /></Suspense>;
}
