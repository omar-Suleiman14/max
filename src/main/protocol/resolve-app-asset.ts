import { isAbsolute, relative, resolve, sep } from 'node:path';

export function resolveAppAsset(rendererRoot: string, request: string): string | undefined {
  try {
    const requestUrl = new URL(request);
    if (requestUrl.protocol !== 'max:' || requestUrl.hostname !== 'app') {
      return undefined;
    }

    const requestedPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'index.html';
    const absolutePath = resolve(rendererRoot, requestedPath);
    const relativePath = relative(rendererRoot, absolutePath);
    const escapesRendererRoot =
      relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);

    return escapesRendererRoot ? undefined : absolutePath;
  } catch {
    return undefined;
  }
}
