import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS, type MaxApi } from '../shared/ipc-contract';
import type { ConfigurableRecordDraft, ObjectKind, PropertyDraft } from '../shared/object-contract';

const maxApi: MaxApi = Object.freeze({
  objects: Object.freeze({
    archiveProperty: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.objectPropertyArchive, id) as ReturnType<MaxApi['objects']['archiveProperty']>,
    archiveRecord: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.objectRecordArchive, id) as ReturnType<MaxApi['objects']['archiveRecord']>,
    createProperty: (draft: PropertyDraft) => ipcRenderer.invoke(IPC_CHANNELS.objectPropertyCreate, draft) as ReturnType<MaxApi['objects']['createProperty']>,
    createRecord: (draft: ConfigurableRecordDraft) => ipcRenderer.invoke(IPC_CHANNELS.objectRecordCreate, draft) as ReturnType<MaxApi['objects']['createRecord']>,
    listAudit: (entityId: string) => ipcRenderer.invoke(IPC_CHANNELS.objectAuditList, entityId) as ReturnType<MaxApi['objects']['listAudit']>,
    listProperties: (objectKind: ObjectKind) => ipcRenderer.invoke(IPC_CHANNELS.objectPropertyList, objectKind) as ReturnType<MaxApi['objects']['listProperties']>,
    listRecords: (objectKind: ObjectKind) => ipcRenderer.invoke(IPC_CHANNELS.objectRecordList, objectKind) as ReturnType<MaxApi['objects']['listRecords']>,
    updateProperty: (id: string, draft: PropertyDraft) => ipcRenderer.invoke(IPC_CHANNELS.objectPropertyUpdate, id, draft) as ReturnType<MaxApi['objects']['updateProperty']>,
    updateRecord: (id: string, draft: ConfigurableRecordDraft) => ipcRenderer.invoke(IPC_CHANNELS.objectRecordUpdate, id, draft) as ReturnType<MaxApi['objects']['updateRecord']>,
  }),
  system: Object.freeze({
    getHealth: () => ipcRenderer.invoke(IPC_CHANNELS.systemHealth) as Promise<Awaited<ReturnType<MaxApi['system']['getHealth']>>>,
  }),
});

contextBridge.exposeInMainWorld('maxApi', maxApi);
