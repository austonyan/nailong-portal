// 验真管理:验真记录查询、限流与防枚举配置。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Notification, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { fmtDateTime, toastResError } from '../shared.jsx';

export default function AdminResVerify() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState(null);
  const [config, setConfig] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/resident/admin/verify-logs');
      setLogs(data.items);
    } catch (err) {
      toastResError(t, err);
      setLogs([]);
    }
    try {
      const data = await api.get('/resident/admin/config');
      const map = {};
      for (const row of data.items) map[row.key] = row.value;
      setConfig(map);
    } catch {
      // config optional
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = async () => {
    setBusy(true);
    try {
      await api.put('/resident/admin/config', {
        'res.verify_limit_per_5min': config['res.verify_limit_per_5min'] ?? '30',
        'res.card_remind_days': config['res.card_remind_days'] ?? '30',
      });
      Notification.success(t('common.save'));
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const RESULT_COLORS = {
    valid: 'app-green',
    not_found: 'app-orange',
    rate_limited: 'app-red',
  };

  const columns = [
    { title: t('res.admin.verify.query'), dataIndex: 'query', width: 220 },
    { title: 'IP', dataIndex: 'ip', width: 140 },
    {
      title: t('common.status'),
      dataIndex: 'result',
      width: 120,
      render: (v) => (
        <Tag color={RESULT_COLORS[v] || 'default'} variant="soft">
          {t(`res.admin.verify.result.${v}`, { defaultValue: v })}
        </Tag>
      ),
    },
    { title: t('res.admin.verify.source'), dataIndex: 'source', width: 100 },
    { title: t('res.field.createdAt'), dataIndex: 'created_at', width: 170, render: fmtDateTime },
  ];

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <Title size="middle">{t('res.admin.verify.title')}</Title>
      </div>

      <Card className="res-info-card">
        <h4>{t('res.admin.verify.configTitle')}</h4>
        <p className="muted-text">{t('res.admin.verify.configTip')}</p>
        <div className="res-config-grid">
          <label>
            <span>{t('res.admin.verify.limitLabel')}</span>
            <Input
              size="large"
              value={config['res.verify_limit_per_5min'] ?? ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, 'res.verify_limit_per_5min': e.target.value }))}
              placeholder="30"
            />
          </label>
          <label>
            <span>{t('res.admin.cards.remindDaysLabel')}</span>
            <Input
              size="large"
              value={config['res.card_remind_days'] ?? ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, 'res.card_remind_days': e.target.value }))}
              placeholder="30"
            />
          </label>
        </div>
        <Button type="primary" loading={busy} onClick={saveConfig}>
          {t('common.save')}
        </Button>
      </Card>

      <Card>
        <h4>{t('res.admin.verify.logsTitle')}</h4>
        <Table columns={columns} dataSource={logs ?? []} loading={logs === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>
    </div>
  );
}
