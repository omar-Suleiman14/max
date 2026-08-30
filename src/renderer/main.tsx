import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { MaxApp } from './app/max-app';
import './styles.css';

import { AppAuthProvider } from './auth/auth-provider';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Max renderer root was not found.');
}

createRoot(root).render(
  <StrictMode>
    <AppAuthProvider>
      <MaxApp />
    </AppAuthProvider>
  </StrictMode>,
);
