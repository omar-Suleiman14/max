
import { DatabaseService } from './src/main/database/database-service';
const db = new DatabaseService('C:/Users/Lenovo/AppData/Roaming/Max/max.sqlite');
db.initialize();
try {
  const newDb = db.databases.createDatabase({ title: 'test-db-archive' });
  console.log('Created db:', newDb.id);
  db.workspace.archiveNode(newDb.id);
  console.log('Archived node:', newDb.id);
  const row = db.workspace.getNode(newDb.id);
  console.log('Archived At:', row?.archivedAt);
} catch (e) {
  console.error('FAILED:', e);
}
db.close();
