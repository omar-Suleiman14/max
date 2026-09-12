
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/Lenovo/AppData/Roaming/Max/max.sqlite');
console.log(db.prepare('SELECT id, title, archived_at, kind FROM workspace_nodes').all());
