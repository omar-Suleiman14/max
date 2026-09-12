
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/Lenovo/AppData/Roaming/Max/max.sqlite');
console.log(db.prepare('SELECT sql FROM sqlite_master WHERE name = \'workspace_nodes\'').get());
