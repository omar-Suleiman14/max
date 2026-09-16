import { describe, expect, it } from 'vitest';

import { CloudBackupError, describeToken, formatTokenDescription } from './cloud-backup-diagnostics';

/** A JWT-shaped token whose payload expires at the given epoch second. */
function tokenExpiringAt(epochSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: epochSeconds, sid: 'sess_secret', sub: 'user_secret' })).toString('base64url');
  return `header.${payload}.signature`;
}

describe('describing a session token without revealing it', () => {
  it('reports absence rather than inventing a token', () => {
    expect(describeToken(undefined)).toEqual({ length: 0, present: false });
    expect(describeToken('')).toEqual({ length: 0, present: false });
    expect(formatTokenDescription(describeToken(null))).toBe('token=absent');
  });

  it('reads the expiry claim and nothing else', () => {
    const description = describeToken(tokenExpiringAt(Math.floor(Date.now() / 1_000) + 120));

    expect(description.present).toBe(true);
    expect(description.expiresInSeconds).toBeGreaterThan(110);
    expect(description.expiresInSeconds).toBeLessThanOrEqual(120);
    // The description is the whole surface, so if a claim is not on it, it
    // cannot reach a log line.
    expect(Object.keys(description).sort()).toEqual(['expiresInSeconds', 'length', 'present']);
  });

  it('says a token has already expired rather than pretending it is fine', () => {
    const line = formatTokenDescription(describeToken(tokenExpiringAt(Math.floor(Date.now() / 1_000) - 90)));
    expect(line).toContain('expiry=expired');
  });

  it('survives a token it cannot decode, and still does not print it', () => {
    const line = formatTokenDescription(describeToken('not-a-jwt-at-all'));

    expect(line).toContain('token=present');
    expect(line).not.toContain('not-a-jwt-at-all');
  });

  it('never puts the token, its payload or any claim into a formatted line', () => {
    const token = tokenExpiringAt(Math.floor(Date.now() / 1_000) + 60);
    const line = formatTokenDescription(describeToken(token));

    expect(line).not.toContain(token);
    expect(line).not.toContain('user_secret');
    expect(line).not.toContain('sess_secret');
    expect(line).not.toContain(token.split('.')[1]);
  });
});

describe('describing a cloud backup failure', () => {
  it('names the step and the HTTP status', () => {
    expect(new CloudBackupError('upload', 'Storage is full.', 507).describe())
      .toBe('Cloud backup failed at step "upload" (HTTP 507): Storage is full.');
  });

  it('omits the status when there was no response to read one from', () => {
    expect(new CloudBackupError('authenticate', 'Sign in to use Max Cloud Backup.').describe())
      .toBe('Cloud backup failed at step "authenticate": Sign in to use Max Cloud Backup.');
  });
});
