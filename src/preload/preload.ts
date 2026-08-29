import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type MaxApi } from '../shared/ipc-contract';

const maxApi: MaxApi = Object.freeze({
  system: Object.freeze({
    getHealth: () => ipcRenderer.invoke(IPC_CHANNELS.systemHealth) as Promise<Awaited<ReturnType<MaxApi['system']['getHealth']>>>,
  }),
});

contextBridge.exposeInMainWorld('maxApi', maxApi);
