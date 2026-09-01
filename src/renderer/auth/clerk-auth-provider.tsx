import { ClerkProvider, SignInButton, UserButton, useAuth as useClerkAuth, useUser } from '@clerk/react';
import { LogIn } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';

import type { Locale } from '../app/i18n';
import { Button } from '../ui/button';
import { AuthContext, type AuthContextValue } from './auth-context';

type ProviderProps = Readonly<{
  children: ReactNode;
  publishableKey: string;
}>;

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { getToken } = useClerkAuth();
  const { isLoaded, isSignedIn, user } = useUser();

  const value = useMemo<AuthContextValue>(() => ({
    getToken,
    isConfigured: true,
    isSignedIn: Boolean(isLoaded && isSignedIn),
    userEmail: user?.primaryEmailAddress?.emailAddress,
    userId: user?.id,
    userName: user?.fullName ?? user?.firstName ?? undefined,
  }), [getToken, isLoaded, isSignedIn, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function ClerkAuthProvider({ children, publishableKey }: ProviderProps) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

type WidgetProps = Readonly<{
  isSignedIn: boolean;
  locale: Locale;
  userEmail?: string;
  userName?: string;
}>;

export function ClerkAuthWidget({ isSignedIn, locale, userEmail, userName }: WidgetProps) {
  return (
    <div className="auth-widget">
      {isSignedIn ? (
        <div className="auth-widget__user">
          <UserButton />
          <div className="auth-widget__info">
            <strong>{userName || (locale === 'ar' ? 'المستخدم' : 'User')}</strong>
            {userEmail && <small>{userEmail}</small>}
          </div>
        </div>
      ) : (
        <SignInButton mode="modal">
          <Button
            className="auth-widget__signin-btn"
            icon={<LogIn aria-hidden="true" size={14} />}
            variant="ghost"
          >
            {locale === 'ar' ? 'تسجيل الدخول السحابي' : 'Sign in for Cloud'}
          </Button>
        </SignInButton>
      )}
    </div>
  );
}
