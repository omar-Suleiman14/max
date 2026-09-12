
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/Lenovo/AppData/Roaming/Max/max.sqlite');
const row = db.prepare('SELECT id, title, archived_at, kind FROM workspace_nodes WHERE title = ?').get('miumiu');
console.log(row);
