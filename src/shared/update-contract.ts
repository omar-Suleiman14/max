export type UpdateStatus = Readonly<{
  state: 'unsupported' | 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error';
  currentVersion: string;
  /** Version waiting to be installed, when the feed named one. */
  availableVersion?: string;
  checkedAt?: string;
}>;

export type UpdateApi = Readonly<{
  getStatus: () => Promise<UpdateStatus>;
  check: () => Promise<UpdateStatus>;
  install: () => Promise<UpdateStatus>;
}>;
