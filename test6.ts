
import { DatabaseService } from './src/main/database/database-service';
const db = new DatabaseService('C:/Users/Lenovo/AppData/Roaming/Max/max.sqlite');
db.initialize();
try {
  db.workspace.archiveNode('f6032bfa-77e8-45be-9f52-8d3f26c42388');
  console.log('Success');
} catch (e) {
  console.error('FAILED:', e);
}
db.close();
