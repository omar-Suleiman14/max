export type UpdateStatus = Readonly<{
  /**
   * `ready` means the update is downloaded and one restart away. `available`
   * means a newer release exists but this build cannot install itself — a Mac,
   * a Linux package or a portable copy — so the answer is a download link.
   */
  state: 'unsupported' | 'idle' | 'checking' | 'downloading' | 'available' | 'ready' | 'current' | 'error';
  currentVersion: string;
  /** Version waiting to be installed, when the feed named one. */
  availableVersion?: string;
  checkedAt?: string;
  /** Where to fetch a release this build cannot install for itself. */
  downloadUrl?: string;
}>;

export type UpdateApi = Readonly<{
  getStatus: () => Promise<UpdateStatus>;
  check: () => Promise<UpdateStatus>;
  install: () => Promise<UpdateStatus>;
}>;
