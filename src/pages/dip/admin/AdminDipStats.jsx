// 统计与报表: 建交/身份量、通过率、驳回率、补件率、类型分布、协议数、
// 礼遇使用、验真查询量、常见驳回原因、近 7 日趋势 + CSV 导出。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Progress, Table, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { DipAdminNav, exportCsv, toastDipError } from '../../../components/dip/shared.jsx';

function StatCard({ label, value }) {
  return (
    <Card hoverable className="dip-stat-card">
      <span className="dip-stat-value">{value}</span>
      <span className="muted-text">{label}</span>
    </Card>
  );
}

export default function AdminDipStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  const load = useCallback(() => {
    api
      .get('/dip/admin/stats')
      .then(setStats)
      .catch((err) => toastDipError(t, err));
  }, [t]);

  useEffect(load, [load]);

  const exportStats = () => {
    if (!stats) return;
    exportCsv('diplomacy-stats.csv', [
      { label: t('dip.stats.submitted'), key: 'submittedRelations' },
      { label: t('dip.stats.established'), key: 'established' },
      { label: t('dip.stats.rejected'), key: 'rejected' },
      { label: t('dip.stats.supplements'), key: 'supplements' },
      { label: t('dip.stats.passRate'), key: 'passRate' },
      { label: t('dip.stats.rejectRate'), key: 'rejectRate' },
      { label: t('dip.stats.supplementRate'), key: 'supplementRate' },
      { label: t('dip.stats.identitiesActive'), key: 'identitiesActive' },
      { label: t('dip.stats.verifyQueries'), key: 'verifyQueries' },
      { label: t('dip.stats.verifyToday'), key: 'verifyToday' },
    ], [stats]);
  };

  if (!stats) {
    return (
      <div className="dip-page">
        <DipAdminNav />
        <p className="muted-text">{t('common.loading')}</p>
      </div>
    );
  }

  const distColumns = [
    { title: t('dip.stats.type'), dataIndex: 'type', render: (v) => v || '-' },
    { title: t('dip.stats.count'), dataIndex: 'n', width: 100 },
  ];

  return (
    <div className="dip-page">
      <DipAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="purple">{t('dip.stats.title')}</Title>
        </h1>
        <Button type="primary" onClick={exportStats}>{t('dip.stats.export')}</Button>
      </div>

      <div className="dip-stat-grid">
        <StatCard label={t('dip.stats.submitted')} value={stats.submittedRelations} />
        <StatCard label={t('dip.stats.established')} value={stats.established} />
        <StatCard label={t('dip.stats.rejected')} value={stats.rejected} />
        <StatCard label={t('dip.stats.passRate')} value={`${stats.passRate}%`} />
        <StatCard label={t('dip.stats.rejectRate')} value={`${stats.rejectRate}%`} />
        <StatCard label={t('dip.stats.supplementRate')} value={`${stats.supplementRate}%`} />
        <StatCard label={t('dip.stats.identitiesActive')} value={stats.identitiesActive} />
        <StatCard label={t('dip.stats.agreementsActive')} value={stats.agreementCounts?.active ?? 0} />
        <StatCard label={t('dip.stats.verifyQueries')} value={stats.verifyQueries} />
        <StatCard label={t('dip.stats.verifyToday')} value={stats.verifyToday} />
      </div>

      <div className="dip-stat-cols">
        <Card>
          <Title size="small">{t('dip.stats.objectDistribution')}</Title>
          <Table className="table-fit" columns={distColumns} dataSource={stats.objectDistribution} rowKey="type" pagination={false} />
        </Card>
        <Card>
          <Title size="small">{t('dip.stats.identityDistribution')}</Title>
          <Table className="table-fit" columns={distColumns} dataSource={stats.identityTypeDistribution} rowKey="type" pagination={false} />
        </Card>
      </div>

      <div className="dip-stat-cols">
        <Card>
          <Title size="small">{t('dip.stats.courtesyUsage')}</Title>
          <Table className="table-fit"
            columns={[
              { title: t('dip.courtesy.type'), dataIndex: 'name', render: (v, r) => v || t(`dip.courtesy.${r.code}`, { defaultValue: r.code }) },
              { title: t('dip.stats.count'), dataIndex: 'n', width: 100 },
            ]}
            dataSource={stats.courtesyUsage}
            rowKey="code"
            pagination={false}
            size="small"
          />
        </Card>
        <Card>
          <Title size="small">{t('dip.stats.rejectReasons')}</Title>
          <Table className="table-fit"
            columns={[
              { title: t('dip.admin.rejectReason'), dataIndex: 'reason', render: (v) => t(`dip.rejectReason.${v}`, { defaultValue: v }) },
              { title: t('dip.stats.count'), dataIndex: 'n', width: 100 },
            ]}
            dataSource={stats.rejectReasons}
            rowKey="reason"
            pagination={false}
            size="small"
          />
        </Card>
      </div>

      <Card>
        <Title size="small">{t('dip.stats.trend7')}</Title>
        <div className="dip-trend">
          {stats.trend.map((d) => {
            const max = Math.max(1, ...stats.trend.map((x) => x.relations + x.identities));
            return (
              <div key={d.day} className="dip-trend-col">
                <Progress percent={Math.round(((d.relations + d.identities) / max) * 100)} showInfo={false} duration={0} />
                <span className="muted-text">{d.day.slice(5)}</span>
                <span className="dip-trend-count">{d.relations + d.identities}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
