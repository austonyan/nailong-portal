// Additive SQLite migrations shared by every office schema.
//
// CREATE TABLE IF NOT EXISTS does not touch databases created before a column
// was introduced, so new columns must also be added with ALTER TABLE. Only
// additive changes belong here.

export function ensureColumn(db, table, column, ddl) {
  const columns = db.pragma(`table_info(${table})`).map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// Adds `TEXT` Traditional-Chinese counterparts for the given base columns.
export function ensureTwColumns(db, table, columns) {
  for (const column of columns) ensureColumn(db, table, `${column}_tw`, 'TEXT');
}

// The appeal_appeals.biz_type CHECK grows whenever a new office joins the
// linkage bus. SQLite cannot alter a CHECK in place, so pre-existing databases
// get a one-time data-preserving table rebuild: the stored CREATE statement is
// rewritten with the extended value list, rows are copied over and indexes are
// recreated. New databases are unaffected (db.js already ships the full list).
export function ensureAppealBizTypes(database, values) {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'appeal_appeals'")
    .get();
  if (!table?.sql) return;
  const match = table.sql.match(/biz_type\s+TEXT NOT NULL CHECK \(biz_type IN \(([^)]*)\)\)/);
  if (!match) return;
  const allowed = match[1]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
  const missing = values.filter((v) => !allowed.includes(v));
  if (!missing.length) return;

  const nextSql = table.sql.replace(match[0], match[0].replace(match[1], [...allowed, ...missing].map((v) => `'${v}'`).join(',')));
  // DROP TABLE takes its indexes with it — capture their DDL and recreate it
  // after the rename so migrated databases keep the same index coverage.
  const indexes = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'appeal_appeals' AND sql IS NOT NULL")
    .all();
  const fk = database.pragma('foreign_keys', { simple: true });
  database.pragma('foreign_keys = OFF');
  try {
    const rebuild = database.transaction(() => {
      // 表名可能带引号:SQLite 在 ALTER TABLE RENAME 之后会把存储的 DDL
      // 重写成 CREATE TABLE "appeal_appeals" (...),第二次重建必须也能命中。
      database.exec(nextSql.replace(/CREATE TABLE (IF NOT EXISTS )?"?appeal_appeals"?/, 'CREATE TABLE appeal_appeals_biz_mig'));
      database.exec('INSERT INTO appeal_appeals_biz_mig SELECT * FROM appeal_appeals');
      database.exec('DROP TABLE appeal_appeals');
      database.exec('ALTER TABLE appeal_appeals_biz_mig RENAME TO appeal_appeals');
      for (const index of indexes) database.exec(index.sql);
    });
    rebuild();
  } finally {
    database.pragma(`foreign_keys = ${fk ? 'ON' : 'OFF'}`);
  }
}