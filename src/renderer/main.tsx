import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { FoundationStatus } from './ui/foundation-status';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Max renderer root was not found.');
}

createRoot(root).render(
  <StrictMode>
    <FoundationStatus />
  </StrictMode>,
);
