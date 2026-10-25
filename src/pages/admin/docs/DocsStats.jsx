import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Notification, Progress, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { APPLICATION_STATUS_COLORS, CERT_STATUS_COLORS } from '../../../api/docs.js';

function pct(v) {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

export default function DocsStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get('/docs/admin/stats')
      .then(setStats)
      .catch((err) => Notification.error(t(`api.${err.code}`, { defaultValue: err.message })));
  }, [t]);

  if (!stats) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const app = stats.applications || {};
  const cert = stats.certificates || {};
  const verify = stats.verify || {};
  const byStatus = Object.entries(app.byStatus || {});
  const certByStatus = Object.entries(cert.byStatus || {});

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.admin.stats.title')}</Title>
      </div>

      <div className="portal-stats">
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.stats.appTotal')}</span>
          <span className="stat-number">{app.total ?? 0}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.stats.approvalRate')}</span>
          <Progress percent={Math.round((app.approvalRate || 0) * 100)} infoFormat={(p) => (app.approvalRate === null || app.approvalRate === undefined ? '—' : `${p}%`)} />
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.stats.rejectRate')}</span>
          <Progress percent={Math.round((app.rejectRate || 0) * 100)} infoFormat={(p) => (app.rejectRate === null || app.rejectRate === undefined ? '—' : `${p}%`)} />
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.stats.supplementRate')}</span>
          <Progress percent={Math.round((app.supplementRate || 0) * 100)} infoFormat={(p) => (app.supplementRate === null || app.supplementRate === undefined ? '—' : `${p}%`)} />
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.stats.avgHours')}</span>
          <span className="stat-number">{app.avgReviewHours ? app.avgReviewHours.toFixed(1) : '—'}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.stats.certTotal')}</span>
          <span className="stat-number">{cert.total ?? 0}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.stats.verifyTotal')}</span>
          <span className="stat-number">{verify.total ?? 0}</span>
          <span className="muted-text">{t('docs.admin.stats.verify24h', { n: verify.last24h ?? 0 })}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.stats.verifyValidRate')}</span>
          <Progress percent={Math.round((verify.validRate || 0) * 100)} infoFormat={(p) => (verify.validRate === null || verify.validRate === undefined ? '—' : `${p}%`)} />
        </Card>
      </div>

      <div className="docs-detail-grid">
        <Card className="docs-block">
          <h3 className="docs-block-title">{t('docs.admin.stats.appByStatus')}</h3>
          <ul className="docs-kv-list">
            {byStatus.map(([s, n]) => (
              <li key={s}>
                <Tag color={APPLICATION_STATUS_COLORS[s] || 'default'} variant="soft">
                  {t(`docs.status.${s}`)}
                </Tag>
                <strong>{n}</strong>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="docs-block">
          <h3 className="docs-block-title">{t('docs.admin.stats.certByStatus')}</h3>
          <ul className="docs-kv-list">
            {certByStatus.map(([s, n]) => (
              <li key={s}>
                <Tag color={CERT_STATUS_COLORS[s] || 'default'} variant="soft">
                  {t(`docs.certStatus.${s}`)}
                </Tag>
                <strong>{n}</strong>
              </li>
            ))}
            {certByStatus.length === 0 && <li className="muted-text">{t('common.empty')}</li>}
          </ul>
        </Card>
      </div>

      <div className="docs-detail-grid">
        <Card className="docs-block">
          <h3 className="docs-block-title">{t('docs.admin.stats.byType')}</h3>
          <Table
            columns={[
              { title: t('docs.appList.type'), dataIndex: 'name', render: (v, r) => v || r.code },
              { title: t('docs.admin.stats.count'), dataIndex: 'n', width: 90, align: 'right' },
            ]}
            dataSource={app.byType || []}
            rowKey="code"
            emptyText={t('common.empty')}
            pagination={false}
          />
        </Card>
        <Card className="docs-block">
          <h3 className="docs-block-title">{t('docs.admin.stats.rejectReasons')}</h3>
          <Table
            columns={[
              {
                title: t('docs.admin.review.rejectReason'),
                dataIndex: 'code',
                render: (v) => t(`docs.reason.${v}`),
              },
              { title: t('docs.admin.stats.count'), dataIndex: 'n', width: 90, align: 'right' },
            ]}
            dataSource={stats.rejectReasons || []}
            rowKey="code"
            emptyText={t('common.empty')}
            pagination={false}
          />
        </Card>
      </div>
    </div>
  );
}
