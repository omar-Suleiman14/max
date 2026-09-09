import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'MAX_');
  return {
    build: {
      rollupOptions: {
        external: ['node:sqlite'],
      },
    },
    define: {
      MAX_UPDATE_WORKER_URL: JSON.stringify(env.MAX_UPDATE_WORKER_URL || 'https://max-backup-worker.omaarsuliiman.workers.dev'),
      MAX_BACKUP_WORKER_URL: JSON.stringify(env.MAX_BACKUP_WORKER_URL || 'https://max-backup-worker.omaarsuliiman.workers.dev'),
    },
  };
});
