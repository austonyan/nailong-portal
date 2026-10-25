// 统计与报表:申请量/通过率/驳回率/补件率/平均审核时长 + 验真记录。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Table, Tag, Title } from 'animal-island-ui';
import { DownloadIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { downloadVisaFile } from '../../api/visa.js';
import { APPLICATION_STATUS_COLORS, PERMIT_STATUS_COLORS, fmtDateTime, toastVisaError } from './shared.jsx';

function pct(v) {
  return `${Math.round(v * 1000) / 10}%`;
}

export default function VisaAdminStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [verifyLogs, setVerifyLogs] = useState(null);

  useEffect(() => {
    api
      .get('/visa/admin/stats')
      .then(setStats)
      .catch((err) => toastVisaError(t, err));
    api
      .get('/visa/admin/verify-logs')
      .then((data) => setVerifyLogs(data.items))
      .catch((err) => toastVisaError(t, err));
  }, [t]);

  const exportCsv = async () => {
    try {
      await downloadVisaFile('/visa/admin/export.csv', `nailong-visa-admin-${Date.now()}.csv`);
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const logColumns = [
    { title: t('visa.admin.verifyQuery'), dataIndex: 'query', width: 200 },
    { title: t('visa.admin.verifyIp'), dataIndex: 'ip', width: 160 },
    {
      title: t('visa.admin.verifyResult'),
      dataIndex: 'result',
      width: 140,
      render: (v) => (
        <Tag variant="soft" color={v === 'valid' ? 'app-green' : v === 'not_found' || v === 'rate_limited' ? 'app-red' : 'app-blue'}>
          {t(`visa.admin.verifyResult_${v}`)}
        </Tag>
      ),
    },
    { title: t('common.createdAt'), dataIndex: 'created_at', render: fmtDateTime },
  ];

  return (
    <div className="visa-stats-page">
      <div className="page-header">
        <Title size="middle">{t('visa.admin.stats.title')}</Title>
        <Button icon={<DownloadIcon />} onClick={exportCsv}>
          {t('visa.admin.stats.export')}
        </Button>
      </div>

      {stats && (
        <>
          <div className="portal-stats">
            <Card className="stat-card">
              <span className="stat-label">{t('visa.admin.stats.submitted')}</span>
              <span className="stat-number">{stats.submitted}</span>
            </Card>
            <Card className="stat-card">
              <span className="stat-label">{t('visa.admin.stats.approvalRate')}</span>
              <span className="stat-number">{pct(stats.approvalRate)}</span>
            </Card>
            <Card className="stat-card">
              <span className="stat-label">{t('visa.admin.stats.rejectRate')}</span>
              <span className="stat-number">{pct(stats.rejectRate)}</span>
            </Card>
            <Card className="stat-card">
              <span className="stat-label">{t('visa.admin.stats.supplementRate')}</span>
              <span className="stat-number">{pct(stats.supplementRate)}</span>
            </Card>
            <Card className="stat-card">
              <span className="stat-label">{t('visa.admin.stats.avgReviewHours')}</span>
              <span className="stat-number">{stats.avgReviewHours}h</span>
            </Card>
            <Card className="stat-card">
              <span className="stat-label">{t('visa.admin.stats.verifyToday')}</span>
              <span className="stat-number">{stats.verifyToday}</span>
            </Card>
          </div>

          <div className="visa-stats-grid">
            <Card>
              <h4>{t('visa.admin.stats.byStatus')}</h4>
              <div className="visa-tag-cloud">
                {Object.entries(stats.statusCounts).map(([status, count]) => (
                  <Tag key={status} color={APPLICATION_STATUS_COLORS[status] || 'default'} variant="soft">
                    {t(`visa.status.${status}`)} · {count}
                  </Tag>
                ))}
              </div>
            </Card>
            <Card>
              <h4>{t('visa.admin.stats.byType')}</h4>
              <div className="visa-tag-cloud">
                {stats.typeDistribution.map((row) => (
                  <Tag key={row.type_code} color="app-teal" variant="soft">
                    {row.type_code} · {row.n}
                  </Tag>
                ))}
              </div>
            </Card>
            <Card>
              <h4>{t('visa.admin.stats.rejectReasons')}</h4>
              <div className="visa-tag-cloud">
                {stats.rejectReasons.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
                {stats.rejectReasons.map((row) => (
                  <Tag key={row.code} color="app-red" variant="soft">
                    {t(`visa.rejectReason.${row.code}`)} · {row.n}
                  </Tag>
                ))}
              </div>
            </Card>
            <Card>
              <h4>{t('visa.admin.stats.permits')}</h4>
              <div className="visa-tag-cloud">
                {Object.keys(stats.permitStatusCounts).length === 0 && <p className="muted-text">{t('common.empty')}</p>}
                {Object.entries(stats.permitStatusCounts).map(([status, count]) => (
                  <Tag key={status} color={PERMIT_STATUS_COLORS[status] || 'default'} variant="soft">
                    {t(`visa.permitStatus.${status}`)} · {count}
                  </Tag>
                ))}
              </div>
              <p className="muted-text">
                {t('visa.admin.stats.verifyTotal', { total: stats.verifyTotal })}
              </p>
            </Card>
          </div>
        </>
      )}

      <Card>
        <h4>{t('visa.admin.stats.verifyLogs')}</h4>
        <Table columns={logColumns} dataSource={verifyLogs ?? []} loading={verifyLogs === null} rowKey="id" pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
}
