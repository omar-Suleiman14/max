import type { MaxApi } from '../shared/ipc-contract';

declare global {
  interface Window {
    maxApi: MaxApi;
  }
}

export {};
