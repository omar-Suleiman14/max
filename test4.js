
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('C:/Users/Lenovo/AppData/Roaming/Max/max.sqlite');
const id = 'f6032bfa-77e8-45be-9f52-8d3f26c42388';
try {
  const nodes = db.prepare('WITH RECURSIVE owned(id) AS (SELECT ? UNION SELECT n.id FROM workspace_nodes n JOIN owned p ON n.parent_node_id = p.id) SELECT n.id FROM workspace_nodes n JOIN owned ON owned.id = n.id WHERE n.archived_at IS NULL').all(id);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO workspace_audit_log (entity_kind, entity_id, action, actor_id, before_json, metadata_json, created_at) VALUES (\'node\', ?, \'archived\', \'local-user\', ?, \'{\}\', ?)').run(id, JSON.stringify(nodes.map(n => n.id)), now);
  for (const node of nodes) {
    db.prepare('UPDATE workspace_nodes SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, node.id);
    db.prepare('UPDATE workspace_records SET archived_at = ?, updated_at = ? WHERE database_id = ? AND archived_at IS NULL').run(now, now, node.id);
  }
  console.log('Success!');
} catch (e) {
  console.error(e);
}
