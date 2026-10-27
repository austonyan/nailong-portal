// 数据导出:勾选指标导出 CSV(写 stat_export_logs 留痕),并查看历史导出记录。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, Table, Title } from 'animal-island-ui';
import { DownloadIcon, RefreshIcon } from 'naive-icons';
import { requestBlob, api } from '../../../api/client.js';
import { toastSuccess } from '../../../components/toast.js';
import { StatsAdminNav } from '../StatsShell.jsx';
import { fmtDateTime, toastStatError } from '../shared.jsx';

export default function AdminStatExport() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState([]);
  const [selected, setSelected] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metricData, logData] = await Promise.all([
        api.get('/stats/admin/metrics'),
        api.get('/stats/admin/export-logs'),
      ]);
      setMetrics(metricData.items);
      setLogs(logData.items);
    } catch (err) {
      toastStatError(t, err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const blob = await requestBlob(`/stats/admin/export.csv?metrics=${encodeURIComponent(selected.join(','))}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stats-metrics-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toastSuccess(t('stat.admin.export.done'));
      await load();
    } catch (err) {
      toastStatError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const options = metrics.map((metric) => ({
    label: `${metric.name} (${metric.code})`,
    value: metric.code,
  }));

  const logColumns = [
    { title: t('stat.admin.export.actor'), dataIndex: 'actor_name', width: 130 },
    { title: t('stat.admin.export.metrics'), dataIndex: 'metric_codes', width: 260 },
    { title: t('stat.admin.export.rowCount'), dataIndex: 'row_count', width: 90 },
    { title: t('stat.admin.export.time'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
  ];

  return (
    <div className="stat-admin-page">
      <StatsAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-orange">
          {t('stat.admin.export.title')}
        </Title>
        <Button icon={<RefreshIcon />} loading={loading} disabled={loading} onClick={load}>
          {t('stat.admin.export.refresh')}
        </Button>
      </div>
      <p className="muted-text">{t('stat.admin.export.tip')}</p>

      <Card>
        <div className="stat-filter-bar">
          <Button size="small" onClick={() => setSelected(metrics.map((metric) => metric.code))}>
            {t('stat.admin.export.selectAll')}
          </Button>
          <Button size="small" onClick={() => setSelected([])}>
            {t('stat.admin.export.clearAll')}
          </Button>
          <span className="muted-text">{t('stat.admin.export.selected', { count: selected.length })}</span>
        </div>
        <Checkbox options={options} value={selected} onChange={setSelected} direction="vertical" />
        <div className="stat-export-actions">
          <Button
            type="primary"
            icon={<DownloadIcon />}
            loading={busy}
            disabled={busy || selected.length === 0}
            onClick={download}
          >
            {t('stat.admin.export.download')}
          </Button>
          {selected.length === 0 && <span className="muted-text">{t('stat.admin.export.noSelection')}</span>}
        </div>
      </Card>

      <Title size="middle" color="app-blue">
        {t('stat.admin.export.logsTitle')}
      </Title>
      <Card>
        <Table
          className="table-fit"
          columns={logColumns}
          dataSource={logs}
          loading={loading}
          rowKey="id"
          pagination={false}
          emptyText={t('stat.admin.export.logsEmpty')}
        />
      </Card>
    </div>
  );
}