import { ipcMain } from 'electron';

import {
  ChaosContractError,
  parseChaosDraftRequestInput,
  parseChaosLocalDefinitionInput,
  type ChaosConnectionStatus,
  type ChaosResult,
} from '../../shared/chaos-integration-contract';
import { IPC_CHANNELS } from '../../shared/ipc-contract';
import type { ChaosService } from '../integrations/chaos/chaos-service';

class ChaosInputError extends Error {}

function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new ChaosInputError(`${name} is missing or too long.`);
  return value;
}

function optionalText(value: unknown, name: string, max: number): string | undefined {
  return value === undefined || value === null ? undefined : text(value, name, max);
}

const UNAVAILABLE_STATUS: ChaosConnectionStatus = {
  access: null, apiOrigin: null, connectionLabel: null, fieldTypes: null, lastCheckedAt: null, limits: null,
  scopes: [], secureStorageAvailable: false, state: 'none', workspaceName: null,
};

/**
 * IPC for the Chaos integration. Arguments are validated here, work happens in
 * {@link ChaosService}, and every answer is a result object. No handler
 * returns the connection token: it enters through test/save and stays in the
 * main process.
 */
export function registerChaosHandlers(trust: (event: Electron.IpcMainInvokeEvent) => void, service: ChaosService | undefined): void {
  function handle<T>(channel: string, work: (service: ChaosService, ...args: unknown[]) => Promise<ChaosResult<T>>): void {
    ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<ChaosResult<T>> => {
      trust(event);
      if (!service) return { error: { code: 'UNAVAILABLE', message: 'Chaos connections are not available in this session.' }, ok: false };
      try {
        return await work(service, ...args);
      } catch (error) {
        if (error instanceof ChaosInputError || error instanceof ChaosContractError) {
          return { error: { code: 'INVALID_INPUT', message: error.message }, ok: false };
        }
        return { error: { code: 'UNKNOWN', message: 'Something went wrong with the Chaos connection. Your workspace was not changed.' }, ok: false };
      }
    });
  }

  ipcMain.handle(IPC_CHANNELS.chaosStatus, async (event) => {
    trust(event);
    return service ? service.getStatus() : UNAVAILABLE_STATUS;
  });
  handle(IPC_CHANNELS.chaosTestConnection, (chaos, origin, token) => chaos.testConnection(text(origin, 'The Chaos address', 2000), text(token, 'The token', 200)));
  handle(IPC_CHANNELS.chaosSaveConnection, (chaos, origin, token) => chaos.saveConnection(text(origin, 'The Chaos address', 2000), text(token, 'The token', 200)));
  handle(IPC_CHANNELS.chaosDisconnect, (chaos) => chaos.disconnect());
  handle(IPC_CHANNELS.chaosListItems, (chaos, kind, cursor) => {
    if (kind !== undefined && kind !== null && kind !== 'form' && kind !== 'quiz') throw new ChaosInputError('Kind must be form or quiz.');
    return chaos.listItems(kind ?? undefined, optionalText(cursor, 'The page cursor', 2000));
  });
  handle(IPC_CHANNELS.chaosListLinks, (chaos, pageId) => chaos.listLinks(text(pageId, 'The page', 120)));
  handle(IPC_CHANNELS.chaosRefreshLinks, (chaos, pageId, force) => chaos.refreshLinks(text(pageId, 'The page', 120), force === true));
  handle(IPC_CHANNELS.chaosLinkExisting, (chaos, pageId, itemId) => chaos.linkExisting(text(pageId, 'The page', 120), text(itemId, 'The item id', 220)));
  handle(IPC_CHANNELS.chaosUnlink, (chaos, linkId) => chaos.unlink(text(linkId, 'The link', 120)));
  handle(IPC_CHANNELS.chaosCreateDraft, (chaos, pageId, request) => chaos.createDraft(text(pageId, 'The page', 120), parseChaosDraftRequestInput(request)));
  handle(IPC_CHANNELS.chaosSaveLocalDefinition, (chaos, linkId, definition) => chaos.saveLocalDefinition(text(linkId, 'The link', 120), parseChaosLocalDefinitionInput(definition)));
  handle(IPC_CHANNELS.chaosAdoptDefinition, (chaos, linkId) => chaos.adoptChaosDefinition(text(linkId, 'The link', 120)));
  handle(IPC_CHANNELS.chaosUpdateDraft, (chaos, linkId, definition, revision) => chaos.updateDraft(
    text(linkId, 'The link', 120),
    parseChaosLocalDefinitionInput(definition),
    optionalText(revision, 'The revision', 200),
  ));
  handle(IPC_CHANNELS.chaosListPendingOperations, (chaos, pageId) => chaos.listPendingOperations(text(pageId, 'The page', 120)));
  handle(IPC_CHANNELS.chaosRetryOperation, (chaos, operationId) => chaos.retryOperation(text(operationId, 'The request', 120)));
  handle(IPC_CHANNELS.chaosDiscardOperation, (chaos, operationId) => chaos.discardOperation(text(operationId, 'The request', 120)));
  handle(IPC_CHANNELS.chaosCopyTemplate, (chaos, itemId) => chaos.copyTemplate(text(itemId, 'The item id', 220)));
}
