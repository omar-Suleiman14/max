export const IPC_CHANNELS = {
  systemHealth: 'max:system:health',
} as const;

export type DatabaseHealth = Readonly<{
  status: 'ready';
  schemaVersion: number;
  migrationCount: number;
}>;

export type SystemHealth = Readonly<{
  appVersion: string;
  database: DatabaseHealth;
  runtime: Readonly<{
    arch: string;
    platform: 'linux' | 'macos' | 'windows';
  }>;
}>;

export type MaxApi = Readonly<{
  system: Readonly<{
    getHealth: () => Promise<SystemHealth>;
  }>;
}>;
