import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';

import { resolveAppAsset } from './resolve-app-asset';

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

export function registerAppProtocol(rendererRoot: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const absolutePath = resolveAppAsset(rendererRoot, request.url);
    if (!absolutePath) {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(absolutePath).toString());
  });
}
