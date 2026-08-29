import { describe, expect, it } from 'vitest';

import {
  assertTrustedSender,
  isTrustedNavigationUrl,
  isTrustedSenderUrl,
} from './trusted-sender';

describe('trusted IPC sender validation', () => {
  it('accepts packaged Max application URLs', () => {
    expect(isTrustedSenderUrl('max://app/index.html')).toBe(true);
  });

  it('accepts only the configured development origin', () => {
    const developmentUrl = 'http://localhost:5173';

    expect(isTrustedSenderUrl('http://localhost:5173/index.html', developmentUrl)).toBe(true);
    expect(isTrustedSenderUrl('http://localhost:4173/index.html', developmentUrl)).toBe(false);
  });

  it('rejects untrusted and malformed senders', () => {
    expect(isTrustedSenderUrl('https://example.com')).toBe(false);
    expect(isTrustedNavigationUrl('javascript:alert(1)')).toBe(false);
    expect(isTrustedNavigationUrl('max://application/index.html')).toBe(false);
    expect(() => assertTrustedSender('not a URL', 'http://localhost:5173')).toThrow(
      'Rejected IPC request from an untrusted renderer.',
    );
  });
});
