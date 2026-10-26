// 申诉署统计报表:申诉/复核/投诉/工单量、时效与超时、结果分布、满意度与验真。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { downloadAppealFile } from '../../api/appeal.js';
import { toastAppealError } from './shared.jsx';

const PCT = (v) => `${Math.round((v || 0) * 100)}%`;

function StatCard({ label, value, tone }) {
  return (
    <div className={`appeal-stat-item ${tone || ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function AppealAdminStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get('/appeal/admin/stats')
      .then(setStats)
      .catch((err) => toastAppealError(t, err));
  }, [t]);

  const doExport = async () => {
    setBusy(true);
    try {
      await downloadAppealFile('/appeal/admin/export.csv', `appeal-records-${Date.now()}.csv`);
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (!stats) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const statusRows = Object.entries(stats.statusCounts ?? {}).map(([k, n]) => ({ key: k, status: k, n }));
  const reviewRows = Object.entries(stats.reviewStatusCounts ?? {}).map(([k, n]) => ({ key: k, status: k, n }));
  const complaintRows = Object.entries(stats.complaintStatusCounts ?? {}).map(([k, n]) => ({ key: k, status: k, n }));
  const ticketRows = Object.entries(stats.ticketStatusCounts ?? {}).map(([k, n]) => ({ key: k, status: k, n }));

  return (
    <div className="appeal-admin-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.stats.title')}</Title>
        <div className="table-actions appeal-filter-bar">
          <Button loading={busy} onClick={doExport} disabled={busy}>
            {t('appeal.stats.export')}
          </Button>
        </div>
      </div>

      <Card className="appeal-stats-card">
        <h4>{t('appeal.stats.appealTitle')}</h4>
        <div className="appeal-stat-grid">
          <StatCard label={t('appeal.stats.submitted')} value={stats.submitted} />
          <StatCard label={t('appeal.stats.acceptRate')} value={PCT(stats.acceptRate)} />
          <StatCard label={t('appeal.stats.rejectRate')} value={PCT(stats.rejectAcceptRate)} />
          <StatCard label={t('appeal.stats.avgAccept')} value={`${stats.avgAcceptHours}h`} />
          <StatCard label={t('appeal.stats.avgResolve')} value={`${stats.avgResolveDays}d`} />
          <StatCard label={t('appeal.stats.acceptOverdue')} value={stats.acceptOverdue} tone={stats.acceptOverdue > 0 ? 'warn' : ''} />
          <StatCard label={t('appeal.stats.resolveOverdue')} value={stats.resolveOverdue} tone={stats.resolveOverdue > 0 ? 'warn' : ''} />
          <StatCard label={t('appeal.stats.satisfaction')} value={stats.satisfaction ?? '-'} />
        </div>
      </Card>

      <Card className="appeal-stats-card">
        <h4>{t('appeal.stats.distTitle')}</h4>
        <div className="appeal-dist-row">
          {(stats.decisionDistribution ?? []).map((d) => (
            <Tag key={d.type} variant="soft" color="app-blue">
              {t(`appeal.decisionType.${d.type}`)}: {d.n}
            </Tag>
          ))}
        </div>
        <div className="appeal-dist-row">
          {(stats.bizDistribution ?? []).map((d) => (
            <Tag key={d.type} variant="outlined">
              {t(`appeal.bizType.${d.type}`)}: {d.n}
            </Tag>
          ))}
        </div>
        <div className="appeal-dist-row">
          {(stats.complaintCategoryDist ?? []).map((d) => (
            <Tag key={d.category} variant="soft" color="app-pink">
              {t(`appeal.complaintCategory.${d.category}`)}: {d.n}
            </Tag>
          ))}
        </div>
        <div className="appeal-dist-row">
          {(stats.refusalReasons ?? []).map((d) => (
            <Tag key={d.reason} variant="soft" color="app-red">
              {d.reason}: {d.n}
            </Tag>
          ))}
        </div>
      </Card>

      <Card className="appeal-stats-card">
        <h4>{t('appeal.stats.otherTitle')}</h4>
        <div className="appeal-stat-grid">
          <StatCard label={t('appeal.stats.complaintSatisfaction')} value={stats.complaintSatisfaction ?? '-'} />
          <StatCard label={t('appeal.stats.verifyTotal')} value={stats.verifyTotal} />
          <StatCard label={t('appeal.stats.verifyToday')} value={stats.verifyToday} />
          <StatCard label={t('appeal.stats.inspectReports')} value={stats.inspectReports} />
          <StatCard label={t('appeal.stats.blacklist')} value={stats.blacklistCount} />
        </div>
      </Card>

      <Card>
        <div className="appeal-stats-tables">
          {[
            { title: t('appeal.stats.appealStatus'), rows: statusRows, prefix: 'appeal.status' },
            { title: t('appeal.stats.reviewStatus'), rows: reviewRows, prefix: 'appeal.reviewStatus' },
            { title: t('appeal.stats.complaintStatus'), rows: complaintRows, prefix: 'appeal.complaintStatus' },
            { title: t('appeal.stats.ticketStatus'), rows: ticketRows, prefix: 'appeal.ticketStatus' },
          ].map((block) => (
            <div key={block.prefix} className="appeal-stats-table">
              <h4>{block.title}</h4>
              <ul className="appeal-list">
                {block.rows.map((r) => (
                  <li key={r.key}>
                    <Tag variant="soft" color="app-teal">
                      {t(`${block.prefix}.${r.status}`)}
                    </Tag>
                    <span>{r.n}</span>
                  </li>
                ))}
                {block.rows.length === 0 && <li className="muted-text">{t('common.empty')}</li>}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
