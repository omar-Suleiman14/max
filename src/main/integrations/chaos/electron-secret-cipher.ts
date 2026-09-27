import { safeStorage } from 'electron';

import type { SecretCipher } from './chaos-token-store';

/**
 * Electron `safeStorage` as a {@link SecretCipher}.
 *
 * Where the only backend on offer is Chromium's hard-coded "basic_text" key
 * (a Linux session without a keyring), encryption is reported as unavailable:
 * that key protects nothing, and Max would rather refuse to keep a token than
 * pretend it is protected.
 */
export const electronSecretCipher: SecretCipher = {
  decrypt: (data) => safeStorage.decryptString(data),
  encrypt: (text) => safeStorage.encryptString(text),
  isAvailable() {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const backend = (safeStorage as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend;
    if (typeof backend !== 'function') return true;
    try { return backend.call(safeStorage) !== 'basic_text'; } catch { return true; }
  },
};
