import { createContext, useContext } from 'react';

export type AuthContextValue = {
  getToken: () => Promise<string | null>;
  isConfigured: boolean;
  isSignedIn: boolean;
  userEmail?: string;
  userId?: string;
  userName?: string;
};

export const AuthContext = createContext<AuthContextValue>({
  getToken: () => Promise.resolve(null),
  isConfigured: false,
  isSignedIn: false,
});

export function useAuth() {
  return useContext(AuthContext);
}
