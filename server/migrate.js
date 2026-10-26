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