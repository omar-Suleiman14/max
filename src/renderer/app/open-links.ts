import { safeWebUrl } from '../../shared/page-links';

const LOCAL_ATTACHMENT = /^max:\/\/attachment\/[0-9a-f]{64}\.[a-z0-9]{1,10}$/;

/**
 * The main window refuses to open new windows. Editor components (links,
 * file downloads) still call `window.open`, so this routes those requests to
 * the validated IPC channels: web addresses open in the system browser and a
 * local attachment or picture opens in its default application.
 */
export function installOpenLinkAdapter(target: Window = window): void {
  target.open = ((url?: string | URL) => {
    const address = String(url ?? '');
    const web = safeWebUrl(address);
    if (web) void target.maxApi.workspace.openExternal(web);
    else if (LOCAL_ATTACHMENT.test(address)) void target.maxApi.assets.openAttachment(address);
    return null;
  });
}
