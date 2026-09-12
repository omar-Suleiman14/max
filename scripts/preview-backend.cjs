const { AssetStore } = require('../src/main/assets/asset-store.ts');
const { DatabaseService } = require('../src/main/database/database-service.ts');
const { PhotoLibrary } = require('../src/main/assets/photo-library.ts');
const { join } = require('node:path');
const { registerIpcHandlers } = require('../src/main/ipc/register-ipc-handlers.ts');
const { getPlatformAdapter } = require('../src/main/platform/platform-adapter.ts');
const { handlers } = require('./preview-electron.cjs');

module.exports = function createPreview(databasePath, origin) {
  // The preview keeps its images beside its disposable database, and serves
  // them over http because the max: scheme only exists inside Electron.
  const assetDirectory = join(databasePath, '..', 'preview-assets');
  const database = new DatabaseService(databasePath);
  database.initialize();
  // Disposable development workspace; never opens the desktop application's data.
  if (!database.shopMetadata.getMetadata().onboardingCompleted) {
    database.shopMetadata.setKey('workspace.template.id', 'blank');
    database.shopMetadata.updateMetadata({ shopName: 'Design workspace', locale: 'en', onboardingCompleted: true, backupSchedule: 'manual' });
    const projects = database.databases.createDatabase({ title: 'Projects', icon: 'lucide:Layers' });
    const tasks = database.databases.createDatabase({ title: 'Tasks', icon: 'lucide:CheckSquare' });
    const status = database.properties.createProperty({ databaseId: projects.id, name: 'Status', type: 'status', options: [{ label: 'Planning', color: 'gray' }, { label: 'In progress', color: 'blue' }, { label: 'Complete', color: 'green' }] });
    const relation = database.properties.createProperty({ databaseId: tasks.id, name: 'Project', type: 'relation' });
    database.relations.createRelation({ sourceDatabaseId: tasks.id, sourcePropertyId: relation.id, targetDatabaseId: projects.id, inversePropertyName: 'Tasks' });
    for (const title of ['Website redesign', 'Product launch', 'Customer research']) database.records.createRecord({ databaseId: projects.id, title, properties: { [status.id]: status.options[0].id } });
    for (const title of ['Explore directions', 'Write project brief', 'Review first draft']) database.records.createRecord({ databaseId: tasks.id, title, properties: {} });
  }
  registerIpcHandlers({
    assets: new AssetStore(assetDirectory),
    cloudBackups: { getStatus: () => ({ configured: false }) },
    database,
    developmentServerUrl: origin,
    photos: new PhotoLibrary(join(assetDirectory, 'integrations.json'), process.env.MAX_UNSPLASH_ACCESS_KEY),
    platform: getPlatformAdapter(),
  });
  return {
    assetDirectory,
    close: () => database.close(),
    invoke: async (channel, args) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error('Unknown preview capability.');
      if (channel.includes('cloud')) throw new Error('Cloud services are disabled in the local preview.');
      // Electron's IPC structured clone keeps a Uint8Array intact; the preview
      // sends JSON, so image bytes arrive as a plain array of numbers.
      const revived = args.map((value) => (
        Array.isArray(value) && value.every((byte) => typeof byte === 'number') && value.length
          ? Uint8Array.from(value)
          : value
      ));
      return handler({ senderFrame: { url: origin } }, ...revived);
    },
  };
};
