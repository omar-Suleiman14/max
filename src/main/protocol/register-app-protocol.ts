import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';

import { resolveAppAsset, resolveWorkspaceAsset } from './resolve-app-asset';

const APP_SCHEME = 'max';

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

/**
 * Serve `max://app/…` (the packaged renderer) and `max://asset/…` (the images
 * this workspace has downloaded).
 *
 * The asset host is registered even when the renderer is being served by the
 * dev server, because covers are stored locally in development too and would
 * otherwise only appear in a packaged build. `rendererRoot` is omitted in that
 * case, and the app host answers nothing.
 */
export function registerAppProtocol(assetRoot: string, rendererRoot?: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const absolutePath = resolveWorkspaceAsset(assetRoot, request.url)
      ?? (rendererRoot ? resolveAppAsset(rendererRoot, request.url) : undefined);
    if (!absolutePath) {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(absolutePath).toString());
  });
}
