import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Encrypts a secret with the operating system's credential protection
 * (DPAPI, Keychain, or the Secret Service keyring). Electron's `safeStorage`
 * is the production implementation; tests supply their own.
 */
export interface SecretCipher {
  decrypt(data: Buffer): string;
  encrypt(text: string): Buffer;
  /** False when the OS offers no real protection; Max then refuses to store a token. */
  isAvailable(): boolean;
}

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('This computer has no secure credential storage available, so Max cannot keep a Chaos token safely.');
    this.name = 'SecureStorageUnavailableError';
  }
}

type TokenFile = { entries: Record<string, string>; version: 1 };

/**
 * Chaos connection tokens, one per connection id, encrypted by the OS and kept
 * in their own file beside the workspace database rather than inside it. The
 * database, local backups, cloud backups and blueprint exports therefore never
 * contain a token. Nothing here returns a token to the renderer; only the
 * main-process client reads it.
 */
export class ChaosTokenStore {
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly cipher: SecretCipher,
  ) {}

  isAvailable(): boolean {
    try { return this.cipher.isAvailable(); } catch { return false; }
  }

  async #read(): Promise<TokenFile> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<TokenFile>;
      if (parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') {
        return { entries: Object.fromEntries(Object.entries(parsed.entries).filter(([, value]) => typeof value === 'string')), version: 1 };
      }
    } catch { /* missing or unreadable: no tokens */ }
    return { entries: {}, version: 1 };
  }

  async #write(contents: TokenFile): Promise<void> {
    if (Object.keys(contents.entries).length === 0) {
      await rm(this.file, { force: true });
      return;
    }
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(contents)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.file);
  }

  /** Serialise writers so two quick saves cannot interleave. */
  #exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(work, work);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  async get(connectionId: string): Promise<string | null> {
    const entry = (await this.#read()).entries[connectionId];
    if (!entry || !this.isAvailable()) return null;
    try { return this.cipher.decrypt(Buffer.from(entry, 'base64')); } catch { return null; }
  }

  async has(connectionId: string): Promise<boolean> {
    return Boolean((await this.#read()).entries[connectionId]);
  }

  set(connectionId: string, token: string): Promise<void> {
    return this.#exclusive(async () => {
      if (!this.isAvailable()) throw new SecureStorageUnavailableError();
      const contents = await this.#read();
      contents.entries[connectionId] = this.cipher.encrypt(token).toString('base64');
      await this.#write(contents);
    });
  }

  delete(connectionId: string): Promise<void> {
    return this.#exclusive(async () => {
      const contents = await this.#read();
      if (!(connectionId in contents.entries)) return;
      delete contents.entries[connectionId];
      await this.#write(contents);
    });
  }

  /** Forget tokens whose connection no longer exists (for example after a workspace was deleted). */
  prune(keep: ReadonlySet<string>): Promise<void> {
    return this.#exclusive(async () => {
      const contents = await this.#read();
      const before = Object.keys(contents.entries).length;
      for (const id of Object.keys(contents.entries)) if (!keep.has(id)) delete contents.entries[id];
      if (Object.keys(contents.entries).length !== before) await this.#write(contents);
    });
  }
}
