const { DatabaseService } = require('../src/main/database/database-service.ts');
const { registerIpcHandlers } = require('../src/main/ipc/register-ipc-handlers.ts');
const { getPlatformAdapter } = require('../src/main/platform/platform-adapter.ts');
const { handlers } = require('./preview-electron.cjs');

module.exports = function createPreview(databasePath, origin) {
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
  registerIpcHandlers({ database, developmentServerUrl: origin, platform: getPlatformAdapter(), cloudBackups: { getStatus: () => ({ configured: false }) } });
  return {
    close: () => database.close(),
    invoke: async (channel, args) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error('Unknown preview capability.');
      if (channel.includes('cloud')) throw new Error('Cloud services are disabled in the local preview.');
      return handler({ senderFrame: { url: origin } }, ...args);
    },
  };
};
