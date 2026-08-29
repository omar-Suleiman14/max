import { contextBridge, ipcRenderer } from 'electron';

import type { Blueprint, CompleteOnboardingDraft, ShopMetadata } from '../shared/blueprint-contract';
import { IPC_CHANNELS, type MaxApi } from '../shared/ipc-contract';
import type { ConfigurableRecordDraft, ObjectKind, PropertyDraft } from '../shared/object-contract';
import type { TemplateDraft } from '../shared/template-contract';

const maxApi: MaxApi = Object.freeze({
  blueprints: Object.freeze({
    export: () => ipcRenderer.invoke(IPC_CHANNELS.blueprintExport) as ReturnType<MaxApi['blueprints']['export']>,
    import: (blueprint: Blueprint) =>
      ipcRenderer.invoke(IPC_CHANNELS.blueprintImport, blueprint) as ReturnType<MaxApi['blueprints']['import']>,
    validate: (blueprint: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.blueprintValidate, blueprint) as ReturnType<MaxApi['blueprints']['validate']>,
  }),
  objects: Object.freeze({
    archiveProperty: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectPropertyArchive, id) as ReturnType<MaxApi['objects']['archiveProperty']>,
    archiveRecord: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordArchive, id) as ReturnType<MaxApi['objects']['archiveRecord']>,
    createProperty: (draft: PropertyDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectPropertyCreate, draft) as ReturnType<MaxApi['objects']['createProperty']>,
    createRecord: (draft: ConfigurableRecordDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordCreate, draft) as ReturnType<MaxApi['objects']['createRecord']>,
    listAudit: (entityId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectAuditList, entityId) as ReturnType<MaxApi['objects']['listAudit']>,
    listProperties: (objectKind: ObjectKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectPropertyList, objectKind) as ReturnType<MaxApi['objects']['listProperties']>,
    listRecords: (objectKind: ObjectKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordList, objectKind) as ReturnType<MaxApi['objects']['listRecords']>,
    updateProperty: (id: string, draft: PropertyDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectPropertyUpdate, id, draft) as ReturnType<MaxApi['objects']['updateProperty']>,
    updateRecord: (id: string, draft: ConfigurableRecordDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.objectRecordUpdate, id, draft) as ReturnType<MaxApi['objects']['updateRecord']>,
  }),
  shop: Object.freeze({
    completeOnboarding: (draft: CompleteOnboardingDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.shopCompleteOnboarding, draft) as ReturnType<MaxApi['shop']['completeOnboarding']>,
    getMetadata: () =>
      ipcRenderer.invoke(IPC_CHANNELS.shopGetMetadata) as ReturnType<MaxApi['shop']['getMetadata']>,
    updateMetadata: (patch: Partial<ShopMetadata>) =>
      ipcRenderer.invoke(IPC_CHANNELS.shopUpdateMetadata, patch) as ReturnType<MaxApi['shop']['updateMetadata']>,
  }),
  system: Object.freeze({
    getHealth: () =>
      ipcRenderer.invoke(IPC_CHANNELS.systemHealth) as Promise<Awaited<ReturnType<MaxApi['system']['getHealth']>>>,
  }),
  templates: Object.freeze({
    archive: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.templateArchive, id) as ReturnType<MaxApi['templates']['archive']>,
    create: (draft: TemplateDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.templateCreate, draft) as ReturnType<MaxApi['templates']['create']>,
    list: (objectKind: ObjectKind) =>
      ipcRenderer.invoke(IPC_CHANNELS.templateList, objectKind) as ReturnType<MaxApi['templates']['list']>,
    update: (id: string, draft: TemplateDraft) =>
      ipcRenderer.invoke(IPC_CHANNELS.templateUpdate, id, draft) as ReturnType<MaxApi['templates']['update']>,
  }),
});

contextBridge.exposeInMainWorld('maxApi', maxApi);
