// 统计与报表:活动/报名/邀请函/接待方/礼遇/验真/签到指标与导出。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Progress, Table, Title } from 'animal-island-ui';
import { DownloadIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { StatusTag, exportProtocolCsv, toastProtocolError } from '../shared.jsx';

function Metric({ label, value, hint }) {
  return (
    <Card className="protocol-metric-card">
      <span className="muted-text">{label}</span>
      <strong>{value}</strong>
      {hint && <small className="muted-text">{hint}</small>}
    </Card>
  );
}

export default function AdminProtocolStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api
      .get('/protocol/admin/stats')
      .then(setStats)
      .catch((err) => toastProtocolError(t, err));
  }, [t]);

  const exportFile = async (kind, name) => {
    try {
      await exportProtocolCsv(`/protocol/admin/export/${kind}`, name);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  if (!stats) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const statusRows = Object.entries(stats.registrations.byStatus || {}).map(([status, count]) => ({ status, count }));
  const eventStatusRows = Object.entries(stats.events.byStatus || {}).map(([status, count]) => ({ status, count }));

  const statusColumns = [
    { title: t('common.status'), dataIndex: 'status', render: (v) => <StatusTag status={v} size="small" /> },
    { title: t('protocol.admin.count'), dataIndex: 'count', width: 100 },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('protocol.admin.statsTitle')}</Title>
        </h1>
        <div className="protocol-inline-gap">
          <Button type="dashed" icon={<DownloadIcon />} onClick={() => exportFile('events', 'protocol-events.csv')}>{t('protocol.admin.exportEvents')}</Button>
          <Button type="dashed" icon={<DownloadIcon />} onClick={() => exportFile('registrations', 'protocol-registrations.csv')}>{t('protocol.admin.exportRegistrations')}</Button>
        </div>
      </div>

      <div className="protocol-metric-grid">
        <Metric label={t('protocol.admin.metricEvents')} value={stats.events.total} hint={t('protocol.admin.metricOpenEvents')} />
        <Metric label={t('protocol.admin.metricRegistrations')} value={stats.registrations.total} />
        <Metric label={t('protocol.admin.metricInvitations')} value={stats.invitations.total} />
        <Metric label={t('protocol.admin.metricHosts')} value={stats.hosts.total} />
        <Metric label={t('protocol.admin.metricCourtesy')} value={stats.courtesy.total} />
        <Metric label={t('protocol.admin.metricVerify')} value={stats.verify.total} hint={t('protocol.admin.metricVerifyValid', { count: stats.verify.valid })} />
        <Metric label={t('protocol.admin.metricCheckins')} value={stats.checkins} />
      </div>

      <div className="protocol-stat-columns">
        <Card>
          <h2 className="block-heading">{t('protocol.admin.rates')}</h2>
          <div className="protocol-rate-row">
            <span>{t('protocol.admin.approvalRate')}</span>
            <Progress percent={stats.registrations.approvalRate} infoFormat={(p) => `${p}%`} />
          </div>
          <div className="protocol-rate-row">
            <span>{t('protocol.admin.waitlistRate')}</span>
            <Progress percent={stats.registrations.waitlistRate} infoFormat={(p) => `${p}%`} />
          </div>
          <div className="protocol-rate-row">
            <span>{t('protocol.admin.rejectRate')}</span>
            <Progress percent={stats.registrations.rejectRate} infoFormat={(p) => `${p}%`} />
          </div>
          <div className="protocol-rate-row">
            <span>{t('protocol.admin.checkinRate')}</span>
            <Progress percent={stats.registrations.checkinRate} infoFormat={(p) => `${p}%`} />
          </div>
          <div className="protocol-rate-row">
            <span>{t('protocol.admin.usageRate')}</span>
            <Progress percent={stats.invitations.usageRate} infoFormat={(p) => `${p}%`} />
          </div>
        </Card>
        <Card>
          <h2 className="block-heading">{t('protocol.admin.eventByType')}</h2>
          <Table className="table-fit"
            columns={[
              { title: t('protocol.field.type'), dataIndex: 'name', render: (v) => v || t('common.unknown') },
              { title: t('protocol.admin.count'), dataIndex: 'n', width: 100 },
            ]}
            dataSource={stats.events.byType}
            rowKey="code"
            pagination={false}
            emptyText={t('protocol.common.noData')}
          />
        </Card>
      </div>

      <div className="protocol-stat-columns">
        <Card>
          <h2 className="block-heading">{t('protocol.admin.registrationByStatus')}</h2>
          <Table className="table-fit" columns={statusColumns} dataSource={statusRows} rowKey="status" pagination={false} emptyText={t('protocol.common.noData')} />
        </Card>
        <Card>
          <h2 className="block-heading">{t('protocol.admin.eventByStatus')}</h2>
          <Table className="table-fit" columns={statusColumns} dataSource={eventStatusRows} rowKey="status" pagination={false} emptyText={t('protocol.common.noData')} />
        </Card>
        <Card>
          <h2 className="block-heading">{t('protocol.admin.rejectReasons')}</h2>
          <Table className="table-fit"
            columns={[
              { title: t('protocol.field.reason'), dataIndex: 'code', render: (v) => t(`protocol.admin.rejectReason.${v}`, { defaultValue: t('common.unknown') }) },
              { title: t('protocol.admin.count'), dataIndex: 'n', width: 100 },
            ]}
            dataSource={stats.registrations.rejectReasons}
            rowKey="code"
            pagination={false}
            emptyText={t('protocol.common.noData')}
          />
        </Card>
        <Card>
          <h2 className="block-heading">{t('protocol.admin.courtesyByType')}</h2>
          <Table className="table-fit"
            columns={[
              { title: t('protocol.field.type'), dataIndex: 'name', render: (v) => v || t('common.unknown') },
              { title: t('protocol.admin.count'), dataIndex: 'n', width: 100 },
            ]}
            dataSource={stats.courtesy.byType}
            rowKey="code"
            pagination={false}
            emptyText={t('protocol.common.noData')}
          />
        </Card>
      </div>
    </div>
  );
}