import { createContext, useContext } from 'react';

export type AuthContextValue = {
  isConfigured: boolean;
  isSignedIn: boolean;
  userEmail?: string;
  userId?: string;
  userName?: string;
};

export const AuthContext = createContext<AuthContextValue>({
  isConfigured: false,
  isSignedIn: false,
});

export function useAuth() {
  return useContext(AuthContext);
}
