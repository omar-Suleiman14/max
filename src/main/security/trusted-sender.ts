export function isTrustedSenderUrl(senderUrl: string, developmentServerUrl?: string): boolean {
  try {
    const sender = new URL(senderUrl);
    if (sender.protocol === 'max:' && sender.hostname === 'app') {
      return true;
    }

    return developmentServerUrl
      ? sender.origin === new URL(developmentServerUrl).origin
      : false;
  } catch {
    return false;
  }
}

export const isTrustedNavigationUrl = isTrustedSenderUrl;

export function assertTrustedSender(senderUrl: string, developmentServerUrl?: string): void {
  if (!isTrustedSenderUrl(senderUrl, developmentServerUrl)) {
    throw new Error('Rejected IPC request from an untrusted renderer.');
  }
}
