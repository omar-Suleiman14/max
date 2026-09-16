import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateRequest, type Env } from '../../../worker/src/index';

/**
 * The Worker's own authentication, rather than the fake one the ownership
 * boundary test injects.
 *
 * Max's only client is the Electron main process. It holds a Clerk session
 * token handed to it by the renderer and sends it as `Authorization: Bearer`,
 * with no cookie and no handshake. `authenticateRequest` from the Clerk SDK is
 * written for a request arriving from a browser, so whether it accepted that
 * shape was the open question in issue #23 and the reason nothing proved the
 * desktop path. A Bearer token is now verified directly with `verifyToken`,
 * which is the documented route for a token already in hand, and these tests
 * hold that route in place.
 */

const verifyToken = vi.hoisted(() => vi.fn());
const authenticateClerkRequest = vi.hoisted(() => vi.fn());

vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ authenticateRequest: authenticateClerkRequest }),
  verifyToken,
}));

const env: Env = {
  BACKUPS_BUCKET: {} as Env['BACKUPS_BUCKET'],
  CLERK_PUBLISHABLE_KEY: 'pk_test',
  CLERK_SECRET_KEY: 'sk_test',
};

function bearer(token: string): Request {
  return new Request('https://worker.test/v1/backups', { headers: { Authorization: `Bearer ${token}` } });
}

/** The reason a 401 carries, which is how a failure is told apart in the field. */
async function reasonOf(response: Response): Promise<string> {
  return (await response.json() as { reason: string }).reason;
}

beforeEach(() => {
  verifyToken.mockReset();
  authenticateClerkRequest.mockReset();
});

describe('the Worker deciding who is calling it', () => {
  it('verifies a desktop Bearer token directly and answers with the Clerk user', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_desktop' });

    const result = await authenticateRequest(bearer('a.session.token'), env);

    expect(result.userId).toBe('user_desktop');
    expect(result.error).toBeUndefined();
    expect(verifyToken).toHaveBeenCalledWith('a.session.token', { secretKey: 'sk_test' });
    // The browser route must not run for a request that carried a token.
    expect(authenticateClerkRequest).not.toHaveBeenCalled();
  });

  it('refuses a token Clerk will not verify, and says so without echoing it', async () => {
    verifyToken.mockRejectedValue(new Error('jwt expired'));

    const response = (await authenticateRequest(bearer('an.expired.token'), env)).error!;

    expect(response.status).toBe(401);
    const body = await response.clone().text();
    expect(await reasonOf(response)).toBe('token-rejected');
    expect(body).not.toContain('an.expired.token');
    // Clerk's own message can name the token, so it must not be passed through.
    expect(body).not.toContain('jwt expired');
  });

  it('refuses a token that verifies but names nobody', async () => {
    verifyToken.mockResolvedValue({});

    const response = (await authenticateRequest(bearer('a.subjectless.token'), env)).error!;

    expect(await reasonOf(response)).toBe('token-missing-subject');
  });

  it('falls through to the browser route when no Bearer token was sent', async () => {
    authenticateClerkRequest.mockResolvedValue({ isAuthenticated: true, toAuth: () => ({ userId: 'user_browser' }) });

    const result = await authenticateRequest(new Request('https://worker.test/v1/backups'), env);

    expect(result.userId).toBe('user_browser');
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('refuses a browser request Clerk does not recognise', async () => {
    authenticateClerkRequest.mockResolvedValue({ isAuthenticated: false, toAuth: () => ({ userId: null }) });

    const response = (await authenticateRequest(new Request('https://worker.test/v1/backups'), env)).error!;

    expect(await reasonOf(response)).toBe('request-unauthenticated');
  });

  it('refuses everything when the Worker has no Clerk credentials, before any network call', async () => {
    const unconfigured: Env = { ...env, CLERK_SECRET_KEY: '' };

    const response = (await authenticateRequest(bearer('a.session.token'), unconfigured)).error!;

    expect(await reasonOf(response)).toBe('clerk-not-configured');
    expect(verifyToken).not.toHaveBeenCalled();
    expect(authenticateClerkRequest).not.toHaveBeenCalled();
  });

  it('never puts a secret key or a token into what it sends back', async () => {
    verifyToken.mockRejectedValue(new Error('token sk_test leaked'));

    const response = (await authenticateRequest(bearer('secret.session.token'), env)).error!;

    const body = await response.text();
    expect(body).not.toContain('sk_test');
    expect(body).not.toContain('secret.session.token');
  });
});
