// 奶龙国皇家统计署 — user-facing endpoints.
// Everything here is aggregate-only: platform fun counters plus the caller's
// own annual report. No endpoint returns another user's rows.
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { ApiError, badRequest, forbidden } from '../http.js';
import { ensureStatsSchema } from './schema.js';
import {
  audit,
  countRows,
  getConfigNumber,
  hasColumn,
  nextReportNo,
  notifyPostal,
  rateLimit,
  safeCount,
  serializeMetric,
  serializeReport,
  tableExists,
} from './util.js';

ensureStatsSchema();

const router = Router();
const portalUser = [authenticate, requirePermission('stat:portal')];

// ---------------------------------------------------------------------------
// Metric catalog + live counts
// ---------------------------------------------------------------------------

function metricWithValue(row) {
  const counted = countRows(row.table_name, { status: row.status_value });
  return { ...serializeMetric(row), value: counted.value, available: counted.available };
}

function enabledMetrics() {
  return db
    .prepare('SELECT * FROM stat_metrics WHERE deleted_at IS NULL AND enabled = 1 ORDER BY sort_order, id')
    .all()
    .map(metricWithValue);
}

router.get('/metrics', ...portalUser, (_req, res) => {
  res.json({ asOf: now(), items: enabledMetrics() });
});

router.get('/home', ...portalUser, (req, res) => {
  const myReports = db
    .prepare('SELECT id, no, year, generated_at, created_at FROM stat_reports WHERE user_id = ? AND deleted_at IS NULL ORDER BY year DESC, id DESC')
    .all(req.user.id);
  res.json({
    asOf: now(),
    metrics: enabledMetrics(),
    my: {
      reports: myReports.length,
      latest: myReports[0]
        ? { id: myReports[0].id, no: myReports[0].no, year: myReports[0].year, generatedAt: myReports[0].generated_at }
        : null,
    },
  });
});

// ---------------------------------------------------------------------------
// Annual report snapshot — COUNT aggregates for the caller only
// ---------------------------------------------------------------------------

const dateColumnCandidates = {
  tour_checkins: ['created_at', 'checkin_date', 'checked_at'],
  tour_badge_awards: ['awarded_at', 'created_at'],
  edu_read_history: ['created_at', 'read_at'],
};

function pickDateColumn(table) {
  const candidates = dateColumnCandidates[table] || ['created_at'];
  for (const column of candidates) {
    if (hasColumn(table, column)) return column;
  }
  return null;
}

// COUNT(*) for one user, optionally restricted to one calendar year of a date
// column. Missing tables/columns read as 0 — parallel offices may not be merged
// yet and the report must still generate.
function userCount(table, userId, { column = null, year = null, extra = '', params = [] } = {}) {
  if (!tableExists(table)) return null;
  const where = ['user_id = ?'];
  const values = [userId];
  if (year !== null) {
    if (!column || !hasColumn(table, column)) return null;
    where.push(`substr(${column}, 1, 4) = ?`);
    values.push(String(year));
  }
  if (hasColumn(table, 'deleted_at')) where.push('deleted_at IS NULL');
  if (extra) {
    where.push(extra);
    values.push(...params);
  }
  return safeCount(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where.join(' AND ')}`, values);
}

function buildSnapshot(userId, year) {
  const sections = [];
  const add = (key, items) => {
    const present = items.filter((item) => item.value !== null);
    if (present.length) sections.push({ key, items: present });
  };

  add('visa', [
    {
      key: 'applications',
      value: userCount('visa_applications', userId, { column: 'submitted_at', year }),
    },
    {
      key: 'issued',
      value: userCount('visa_permits', userId, { column: 'issued_at', year }),
    },
    {
      key: 'approved',
      value:
        tableExists('visa_applications') && hasColumn('visa_applications', 'status')
          ? safeCount(
              `SELECT COUNT(*) AS n FROM visa_applications
               WHERE user_id = ? AND status IN ('approved','issued')
                 AND substr(COALESCE(decided_at, issued_at, updated_at), 1, 4) = ?`,
              [userId, String(year)]
            )
          : null,
    },
  ]);

  add('immigration', [
    {
      key: 'declarations',
      value: userCount('im_declarations', userId, { column: 'submitted_at', year }),
    },
    {
      key: 'entries',
      value: userCount('im_entry_records', userId, { column: 'entry_date', year }),
    },
    {
      key: 'exits',
      value: userCount('im_exit_records', userId, { column: 'exit_date', year }),
    },
  ]);

  add('tourism', [
    {
      key: 'checkins',
      value: userCount('tour_checkins', userId, { column: pickDateColumn('tour_checkins'), year }),
    },
    {
      // 徽章发放记录(tour_badge_awards),不是徽章目录表 tour_badges。
      key: 'badges',
      value: userCount('tour_badge_awards', userId, { column: pickDateColumn('tour_badge_awards'), year }),
    },
  ]);

  add('postal', [
    {
      key: 'postcardsSent',
      value:
        tableExists('post_postcards') && hasColumn('post_postcards', 'sender_id')
          ? safeCount(
              `SELECT COUNT(*) AS n FROM post_postcards
               WHERE sender_id = ? AND status IN ('sent','received')
                 AND substr(COALESCE(sent_at, created_at), 1, 4) = ?`,
              [userId, String(year)]
            )
          : null,
    },
    {
      key: 'postcardsReceived',
      value:
        tableExists('post_postcards') && hasColumn('post_postcards', 'recipient_id')
          ? safeCount(
              `SELECT COUNT(*) AS n FROM post_postcards
               WHERE recipient_id = ? AND status = 'received'
                 AND substr(COALESCE(received_at, updated_at), 1, 4) = ?`,
              [userId, String(year)]
            )
          : null,
    },
  ]);

  add('archives', [
    {
      key: 'deletionRequests',
      value: userCount('arch_deletion_requests', userId, { column: 'created_at', year }),
    },
  ]);

  add('protocol', [
    {
      key: 'registrations',
      value: userCount('pro_registrations', userId, { column: 'submitted_at', year }),
    },
    {
      key: 'checkedIn',
      value:
        tableExists('pro_registrations') && hasColumn('pro_registrations', 'checked_in_at')
          ? userCount('pro_registrations', userId, {
              column: 'checked_in_at',
              year,
              extra: "status IN ('checked_in','finished')",
            })
          : null,
    },
  ]);

  add('education', [
    {
      key: 'reads',
      value: userCount('edu_read_history', userId, { column: pickDateColumn('edu_read_history'), year }),
    },
  ]);

  add('diplomatic', [
    {
      key: 'relations',
      value: userCount('dip_relations', userId, { column: 'created_at', year }),
    },
    {
      key: 'identities',
      value: userCount('dip_identities', userId, { column: 'created_at', year }),
    },
  ]);

  add('documents', [
    {
      key: 'certificates',
      value: userCount('doc_certificates', userId, { column: 'issued_at', year }),
    },
  ]);

  add('resident', [
    {
      key: 'resident',
      value: tableExists('res_residents')
        ? safeCount('SELECT COUNT(*) AS n FROM res_residents WHERE user_id = ?', [userId])
        : null,
    },
    {
      key: 'cards',
      value: userCount('res_cards', userId, { column: 'issued_at', year }),
    },
  ]);

  add('appeal', [
    {
      key: 'submitted',
      value: userCount('appeal_appeals', userId, { column: 'submitted_at', year }),
    },
    {
      key: 'resolved',
      value:
        tableExists('appeal_appeals') && hasColumn('appeal_appeals', 'status')
          ? safeCount(
              `SELECT COUNT(*) AS n FROM appeal_appeals
               WHERE user_id = ? AND status = 'resolved' AND substr(resolved_at, 1, 4) = ?`,
              [userId, String(year)]
            )
          : null,
    },
  ]);

  return { year, generatedAt: now(), sections };
}

// ---------------------------------------------------------------------------
// My reports
// ---------------------------------------------------------------------------

router.get('/reports', ...portalUser, (req, res) => {
  const rows = db
    .prepare(
      'SELECT * FROM stat_reports WHERE user_id = ? AND deleted_at IS NULL ORDER BY year DESC, id DESC'
    )
    .all(req.user.id);
  res.json({ items: rows.map((row) => serializeReport(row, { withSnapshot: false })) });
});

router.get('/reports/:id', ...portalUser, (req, res) => {
  const row = db.prepare('SELECT * FROM stat_reports WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw new ApiError(404, 'STAT_REPORT_NOT_FOUND', 'Report not found');
  if (row.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your report');
  res.json({ report: serializeReport(row) });
});

router.post('/reports', ...portalUser, async (req, res, next) => {
  try {
    const currentYear = new Date().getFullYear();
    const year = req.body?.year === undefined || req.body?.year === null ? currentYear : Number(req.body.year);
    if (!Number.isInteger(year) || year < 2000 || year > currentYear) {
      throw badRequest('STAT_YEAR_INVALID', `Year must be an integer between 2000 and ${currentYear}`);
    }
    if (!rateLimit(`stat:report:${req.user.id}`, getConfigNumber('stat.report_rate_per_hour', 6), 60 * 60 * 1000)) {
      throw new ApiError(429, 'STAT_RATE_LIMITED', 'Too many report generations, please try again later');
    }

    const snapshot = buildSnapshot(req.user.id, year);
    const ts = now();
    const existing = db.prepare('SELECT * FROM stat_reports WHERE user_id = ? AND year = ?').get(req.user.id, year);
    let reportId;
    if (existing) {
      db.prepare(
        'UPDATE stat_reports SET snapshot = ?, generated_at = ?, updated_at = ?, deleted_at = NULL WHERE id = ?'
      ).run(JSON.stringify(snapshot), ts, ts, existing.id);
      reportId = existing.id;
    } else {
      const no = nextReportNo();
      const info = db
        .prepare(
          `INSERT INTO stat_reports (no, user_id, year, snapshot, generated_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(no, req.user.id, year, JSON.stringify(snapshot), ts, ts, ts);
      reportId = info.lastInsertRowid;
    }

    const row = db.prepare('SELECT * FROM stat_reports WHERE id = ?').get(reportId);
    const postal = await notifyPostal({
      userId: String(req.user.id),
      source: 'stats',
      type: 'annual_report_ready',
      params: { no: row.no, year: row.year },
    });
    audit(req.user, 'report_generate', 'report', row.no, {
      year: row.year,
      regenerated: !!existing,
      postal: postal?.skipped ? 'skipped' : postal?.id ? 'sent' : 'unavailable',
    });

    res.json({ report: serializeReport(row), postal: postal?.skipped ? 'skipped' : postal?.id ? 'sent' : 'unavailable' });
  } catch (err) {
    next(err);
  }
});

export default router;