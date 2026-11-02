// One-way cleanup for the retired upload feature.
//
// The portal now stores text only. Existing databases may still carry the
// material tables/columns from earlier releases, and the data directory may
// still contain uploaded files. This module drops that legacy schema and
// removes the upload tree on boot. It is idempotent: new databases have
// nothing to drop and no upload directory.
//
// This is the one deliberate exception to the additive-migration rule: the
// retired feature is removed for good, so its tables and the files they point
// at are deleted rather than left dormant.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NAILONG_DATA_DIR || path.join(__dirname, 'data');

const LEGACY_TABLES = [
  'visa_materials',
  'doc_materials',
  'appeal_materials',
  'im_attachments',
  'res_materials',
  'dip_materials',
  'pro_materials',
];

const LEGACY_COLUMNS = [
  ['doc_types', 'materials'],
  ['pro_event_types', 'materials'],
  ['pro_events', 'materials'],
  ['res_types', 'require_avatar'],
  ['res_types', 'require_address_proof'],
  ['res_residents', 'avatar_material_id'],
];

function tableExists(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function dropLegacyColumn(db, table, column) {
  if (!tableExists(db, table)) return;
  const columns = db.pragma(`table_info(${table})`).map((c) => c.name);
  if (!columns.includes(column)) return;
  try {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch (err) {
    // Very old SQLite builds cannot drop columns. Leaving the column dormant is
    // safe because no code reads or writes it any more.
    console.warn(`[nailong] could not drop legacy column ${table}.${column}:`, err.message);
  }
}

export function dropLegacyUploadSchema(db) {
  for (const table of LEGACY_TABLES) {
    if (tableExists(db, table)) db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  for (const [table, column] of LEGACY_COLUMNS) dropLegacyColumn(db, table, column);
  if (tableExists(db, 'doc_config')) {
    db.prepare("DELETE FROM doc_config WHERE key = 'docs.upload_max_mb'").run();
  }
}

export function removeLegacyUploads() {
  const uploads = path.join(dataDir, 'uploads');
  if (!fs.existsSync(uploads)) return;
  fs.rmSync(uploads, { recursive: true, force: true });
  console.log('[nailong] removed legacy uploads directory');
}
