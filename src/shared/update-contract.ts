export type UpdateStatus = Readonly<{
  state: 'unsupported' | 'idle' | 'checking' | 'downloading' | 'ready' | 'current' | 'error';
  currentVersion: string;
  checkedAt?: string;
}>;

export type UpdateApi = Readonly<{
  getStatus: () => Promise<UpdateStatus>;
  check: () => Promise<UpdateStatus>;
  install: () => Promise<UpdateStatus>;
}>;
