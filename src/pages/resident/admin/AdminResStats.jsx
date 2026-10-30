// 统计与报表:登记量、通过率、类型分布、居民卡状态、验真量与趋势。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CountUp, Progress, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { fmtDate, toastResError } from '../shared.jsx';

function StatCard({ label, value, suffix }) {
  return (
    <Card className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-number">
        {value == null ? '-' : <CountUp isCounting end={value} duration={1.2} />}
        {suffix}
      </span>
    </Card>
  );
}

export default function AdminResStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get('/resident/admin/stats')
      .then(setStats)
      .catch((err) => toastResError(t, err));
  }, [t]);

  if (!stats) return null;
  const maxTrend = Math.max(1, ...stats.trend.map((d) => d.submissions));

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('res.admin.stats.title')}
          </Title>
        </h1>
      </div>

      <div className="portal-stats">
        <StatCard label={t('res.admin.stats.submitted')} value={stats.submitted} />
        <StatCard label={t('res.admin.stats.approved')} value={stats.statusCounts.approved || 0} />
        <StatCard label={t('res.admin.stats.rejected')} value={stats.statusCounts.rejected || 0} />
        <StatCard label={t('res.admin.stats.supplements')} value={stats.supplementRate ? Math.round(stats.supplementRate * stats.submitted) : 0} />
      </div>

      <div className="portal-stats">
        <Card className="stat-card">
          <span className="stat-label">{t('res.admin.stats.approvalRate')}</span>
          <Progress percent={stats.approvalRate * 100} infoFormat={(p) => `${Math.round(p)}%`} />
          <span className="stat-label">{t('res.admin.stats.rejectRate')}</span>
          <Progress percent={stats.rejectRate * 100} infoFormat={(p) => `${Math.round(p)}%`} />
          <span className="stat-label">{t('res.admin.stats.avgReview')}</span>
          <span className="stat-number">{stats.avgReviewHours != null ? t('common.unitHours', { hours: stats.avgReviewHours }) : '-'}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('res.admin.stats.cardsValid')}</span>
          <span className="stat-number">{stats.cardStatusCounts.valid || 0}</span>
          <span className="stat-label">{t('res.admin.stats.cardsFrozen')}</span>
          <span className="stat-number">{stats.cardStatusCounts.frozen || 0}</span>
          <span className="stat-label">{t('res.admin.stats.cardsExpired')}</span>
          <span className="stat-number">{stats.cardStatusCounts.expired || 0}</span>
          <span className="stat-label">{t('res.admin.stats.cardsVoided')}</span>
          <span className="stat-number">{stats.cardStatusCounts.voided || 0}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('res.admin.stats.verifyToday')}</span>
          <span className="stat-number">{stats.verifyToday}</span>
          <span className="stat-label">{t('res.admin.stats.verifyTotal')}</span>
          <span className="stat-number">{stats.verifyTotal}</span>
          <span className="stat-label">{t('res.admin.stats.changesTotal')}</span>
          <span className="stat-number">
            {(stats.changeCounts.info || 0) + (stats.changeCounts.upgrade || 0) + (stats.changeCounts.renewal || 0)}
          </span>
        </Card>
      </div>

      <div className="res-stats-grid">
        <Card>
          <b>{t('res.admin.stats.trend7')}</b>
          <div className="res-trend">
            {stats.trend.map((d) => (
              <div key={d.day} className="res-trend-col">
                <div className="res-trend-bar" style={{ height: `${(d.submissions / maxTrend) * 90 + 4}px` }} title={`${d.day}: ${d.submissions}`} />
                <span className="muted-text">{fmtDate(d.day)}</span>
                <span className="res-trend-n">{d.submissions}</span>
              </div>
            ))}
            {stats.trend.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
          </div>
        </Card>
        <Card>
          <b>{t('res.admin.stats.typeDistribution')}</b>
          {stats.typeDistribution.map((row) => (
            <p key={row.type_code} className="res-info-row">
              <span>{row.typeName || row.type_code}</span>
              <b>{row.n}</b>
            </p>
          ))}
          {stats.typeDistribution.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        </Card>
        <Card>
          <b>{t('res.admin.stats.residentDistribution')}</b>
          {stats.residentTypeDistribution.map((row) => (
            <p key={row.type_code} className="res-info-row">
              <span>{row.typeName || row.type_code}</span>
              <b>{row.n}</b>
            </p>
          ))}
          {stats.residentTypeDistribution.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        </Card>
        <Card>
          <b>{t('res.admin.stats.rejectReasons')}</b>
          {stats.rejectReasons.map((r) => (
            <p key={r.code} className="res-info-row">
              <span>{t(`res.rejectReason.${r.code}`)}</span>
              <b>{r.n}</b>
            </p>
          ))}
          {stats.rejectReasons.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        </Card>
      </div>
    </div>
  );
}
