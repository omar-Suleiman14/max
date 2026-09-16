import type { CloudBackupStep } from '../../shared/backup-contract';

/**
 * When a cloud backup fails, the only thing that matters is which of the eleven
 * steps stopped and why. Before this existed, every failure arrived as one
 * sentence with no step, no HTTP status and no remote message, so the same
 * report covered "you are not signed in", "the worker is down" and "the bytes
 * that came back are not the backup you asked for".
 *
 * Nothing here may ever carry an authentication token, a Clerk secret or an R2
 * credential. Tokens are described, never printed: whether one is present, how
 * long it is, and how many seconds until it expires. `describeToken` is the
 * only function allowed to look at a token at all, and it reads exactly one
 * claim out of it.
 */

/**
 * The message is the whole legible line, not the bare reason.
 *
 * Only `message` survives the trip from the main process to the renderer, so a
 * failure that carried its step in a separate field arrived as "Backup not
 * found" with nothing to say which of the fourteen steps that was. A failed
 * upload read well because `create` formatted it by hand; a failed listing,
 * download or restore did not. Building the line in the constructor makes every
 * one of them legible wherever it ends up, and `reason` keeps the remote's own
 * words for anything that wants them on their own.
 */
export class CloudBackupError extends Error {
  readonly reason: string;
  readonly status?: number;
  readonly step: CloudBackupStep;

  constructor(step: CloudBackupStep, reason: string, status?: number) {
    const status_ = status === undefined ? '' : ` (HTTP ${status})`;
    super(`Cloud backup failed at step "${step}"${status_}: ${reason}`);
    this.name = 'CloudBackupError';
    this.reason = reason;
    this.status = status;
    this.step = step;
  }

  /** A single line safe to show a person and safe to write to a log. */
  describe(): string {
    return this.message;
  }
}

export type TokenDescription = Readonly<{
  expiresInSeconds?: number;
  length: number;
  present: boolean;
}>;

/**
 * Describe a session token without revealing it. Only the `exp` claim is read,
 * and only to say how long is left, because an expired token is the single most
 * likely cause of a working setup starting to fail.
 */
export function describeToken(token: string | undefined | null): TokenDescription {
  if (!token) return { length: 0, present: false };

  const payload = token.split('.')[1];
  if (!payload) return { length: token.length, present: true };

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    const exp = typeof decoded === 'object' && decoded !== null ? (decoded as { exp?: unknown }).exp : undefined;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return { length: token.length, present: true };
    return { expiresInSeconds: Math.round(exp - Date.now() / 1_000), length: token.length, present: true };
  } catch {
    // A token Max cannot read is still a token it must not print.
    return { length: token.length, present: true };
  }
}

export type CloudBackupLogger = (line: string) => void;

/** The default logger writes one redacted line per step to the main process log. */
export const consoleCloudBackupLogger: CloudBackupLogger = (line) => {
  console.info(`[max-cloud-backup] ${line}`);
};

export function formatTokenDescription(description: TokenDescription): string {
  if (!description.present) return 'token=absent';
  const expiry = description.expiresInSeconds === undefined
    ? 'expiry=unreadable'
    : description.expiresInSeconds <= 0
      ? `expiry=expired ${Math.abs(description.expiresInSeconds)}s ago`
      : `expiry=in ${description.expiresInSeconds}s`;
  return `token=present length=${description.length} ${expiry}`;
};
