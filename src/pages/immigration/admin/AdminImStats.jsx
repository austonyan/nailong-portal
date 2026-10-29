import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Card, CountUp, Progress, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { toastApiError } from '../../../components/immigration/apiError.js';
import { CrowdMeter, ImAdminNav } from '../../../components/immigration/shared.jsx';

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

export default function AdminImStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get('/immigration/admin/stats')
      .then(setStats)
      .catch(toastApiError);
  }, []);

  if (!stats) return null;
  const maxTrend = Math.max(1, ...stats.trend.map((d) => d.submissions));

  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {t('imm.admin.stats.title')}
        </Title>
      </div>

      <div className="portal-stats">
        <StatCard label={t('imm.admin.stats.submitted')} value={stats.submitted} />
        <StatCard label={t('imm.admin.stats.approved')} value={stats.approved} />
        <StatCard label={t('imm.admin.stats.rejected')} value={stats.rejected} />
        <StatCard label={t('imm.admin.stats.supplements')} value={stats.supplements} />
      </div>

      <div className="portal-stats">
        <Card className="stat-card">
          <span className="stat-label">{t('imm.admin.stats.passRate')}</span>
          <Progress percent={stats.passRate} infoFormat={(p) => `${Math.round(p)}%`} />
          <span className="stat-label">{t('imm.admin.stats.rejectRate')}</span>
          <Progress percent={stats.rejectRate} infoFormat={(p) => `${Math.round(p)}%`} />
          <span className="stat-label">{t('imm.admin.stats.supplementRate')}</span>
          <Progress percent={stats.supplementRate} infoFormat={(p) => `${Math.round(p)}%`} />
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('imm.admin.stats.avgReview')}</span>
          <span className="stat-number">{stats.avgReviewHours != null ? t('common.unitHours', { hours: stats.avgReviewHours }) : '-'}</span>
          <span className="stat-label">{t('imm.admin.stats.passChecks')}</span>
          <span className="stat-number">{stats.passChecks}</span>
          <span className="stat-label">{t('imm.admin.stats.activePassCodes')}</span>
          <span className="stat-number">{stats.passCodesActive}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('imm.admin.stats.entryRecords')}</span>
          <span className="stat-number">{stats.entryRecords}</span>
          <span className="stat-label">{t('imm.admin.stats.exitRecords')}</span>
          <span className="stat-number">{stats.exitRecords}</span>
          <span className="stat-label">{t('imm.home.crowding')}</span>
          <CrowdMeter crowding={stats.crowding} />
        </Card>
      </div>

      <div className="im-stats-grid">
        <Card>
          <b>{t('imm.admin.stats.trend7')}</b>
          <div className="im-trend">
            {stats.trend.map((d) => (
              <div key={d.day} className="im-trend-col">
                <div className="im-trend-bar" style={{ height: `${(d.submissions / maxTrend) * 90 + 4}px` }} title={`${d.day}: ${d.submissions}`} />
                <span className="muted-text">{d.day ? dayjs(d.day).format('MM-DD') : '-'}</span>
                <span className="im-trend-n">{d.submissions}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <b>{t('imm.admin.stats.portTraffic')}</b>
          {stats.portTraffic.map((p) => (
            <p key={p.portName} className="im-info-row">
              <span>{p.portName}</span>
              <b>{p.declarations}</b>
            </p>
          ))}
        </Card>
        <Card>
          <b>{t('imm.admin.stats.rejectReasons')}</b>
          {stats.rejectReasons.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
          {stats.rejectReasons.map((r) => (
            <p key={r.reason} className="im-info-row">
              <span>{t(`imm.rejectReason.${r.reason}`, { defaultValue: t('common.unknown') })}</span>
              <b>{r.n}</b>
            </p>
          ))}
        </Card>
      </div>
    </div>
  );
}
