import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Lock, LogIn } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';

import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { AuthContext, useAuth, type AuthContextValue } from './auth-context';

const publishableKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim();

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();

  const value = useMemo<AuthContextValue>(() => ({
    isConfigured: true,
    isSignedIn: Boolean(isLoaded && isSignedIn),
    userEmail: user?.primaryEmailAddress?.emailAddress,
    userId: user?.id,
    userName: user?.fullName ?? user?.firstName ?? undefined,
  }), [isLoaded, isSignedIn, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey || publishableKey === 'pk_test_placeholder_key') {
    // Offline-first fallback: run without Clerk
    const offlineValue: AuthContextValue = {
      isConfigured: false,
      isSignedIn: false,
    };
    return (
      <AuthContext.Provider value={offlineValue}>
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthBridge>
        {children}
      </ClerkAuthBridge>
    </ClerkProvider>
  );
}

/** Render Clerk User profile widget or local offline indicator in Sidebar/Settings */
export function AuthWidget({ locale }: { locale: Locale }) {
  const { isConfigured, userName, userEmail } = useAuth();

  if (!isConfigured) {
    return (
      <div className="auth-widget auth-widget--offline" title={locale === 'ar' ? 'وضع غير متصل بالإنترنت' : 'Offline local-only mode'}>
        <Lock size={14} aria-hidden="true" />
        <span>{locale === 'ar' ? 'محلي دون اتصال' : 'Local offline mode'}</span>
      </div>
    );
  }

  return (
    <div className="auth-widget">
      <SignedIn>
        <div className="auth-widget__user">
          <UserButton afterSignOutUrl="/" />
          <div className="auth-widget__info">
            <strong>{userName || (locale === 'ar' ? 'المستخدم' : 'User')}</strong>
            {userEmail && <small>{userEmail}</small>}
          </div>
        </div>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <Button
            className="auth-widget__signin-btn"
            icon={<LogIn size={14} aria-hidden="true" />}
            variant="ghost"
          >
            {locale === 'ar' ? 'تسجيل الدخول السحابي' : 'Sign in for Cloud'}
          </Button>
        </SignInButton>
      </SignedOut>
    </div>
  );
}
