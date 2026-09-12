import { isAbsolute, relative, resolve, sep } from 'node:path';

function within(root: string, requestedPath: string): string | undefined {
  const absolutePath = resolve(root, requestedPath);
  const relativePath = relative(root, absolutePath);
  const escapesRoot = relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
  return escapesRoot ? undefined : absolutePath;
}

export function resolveAppAsset(rendererRoot: string, request: string): string | undefined {
  try {
    const requestUrl = new URL(request);
    if (requestUrl.protocol !== 'max:' || requestUrl.hostname !== 'app') {
      return undefined;
    }

    const requestedPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
    return within(rendererRoot, requestedPath);
  } catch {
    return undefined;
  }
}

/**
 * A file in the workspace's own image store, addressed as `max://asset/<name>`.
 *
 * Names are the SHA-256 the store wrote, so the shape is checked rather than
 * merely resolved: nothing outside the store can be reached, and a request for
 * anything that is not one of its files is simply not found.
 */
export function resolveWorkspaceAsset(assetRoot: string, request: string): string | undefined {
  try {
    const requestUrl = new URL(request);
    if (requestUrl.protocol !== 'max:' || requestUrl.hostname !== 'asset') return undefined;

    const name = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
    if (!/^[0-9a-f]{64}\.(png|jpg|gif|webp)$/.test(name)) return undefined;
    return within(assetRoot, name);
  } catch {
    return undefined;
  }
}
