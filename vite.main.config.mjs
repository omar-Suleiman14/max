import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'MAX_BACKUP_WORKER_URL');
  return {
    build: {
      rollupOptions: {
        external: ['node:sqlite'],
      },
    },
    define: {
      MAX_BACKUP_WORKER_URL: JSON.stringify(env.MAX_BACKUP_WORKER_URL || 'https://max-backup-worker.omaarsuliiman.workers.dev'),
    },
  };
});
