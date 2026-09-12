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
      // Updates are served by GitHub Releases, so a self-hosted release feed is
      // not part of running Max. Set MAX_UPDATE_FEED_URL to point a build at a
      // different Squirrel feed.
      MAX_UPDATE_FEED_URL: JSON.stringify(env.MAX_UPDATE_FEED_URL || 'https://github.com/omar-Suleiman14/max/releases/latest/download'),
      MAX_BACKUP_WORKER_URL: JSON.stringify(env.MAX_BACKUP_WORKER_URL || 'https://max-backup-worker.omaarsuliiman.workers.dev'),
      // Optional. Unsplash covers need a free access key; without one the cover
      // picker keeps its gallery, uploads and links, and asks for a key.
      MAX_UNSPLASH_ACCESS_KEY: JSON.stringify(env.MAX_UNSPLASH_ACCESS_KEY || ''),
    },
  };
});
