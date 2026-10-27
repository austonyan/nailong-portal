// 审计查看:本署全部敏感操作(口径增删改、导出、年度报告生成)留痕一览。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Select, Table, Tag, Title } from 'animal-island-ui';
import { RefreshIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { StatsAdminNav } from '../StatsShell.jsx';
import { fmtDateTime, toastStatError } from '../shared.jsx';

// 与服务端 admin.js 实际写入的 action 一一对应。
const ACTIONS = ['metric_create', 'metric_update', 'metric_delete', 'export', 'report_generate'];

export default function AdminStatAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = action ? `?action=${encodeURIComponent(action)}` : '';
      const data = await api.get(`/stats/admin/audit${query}`);
      setItems(data.items);
    } catch (err) {
      toastStatError(t, err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [action, t]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { title: t('stat.admin.audit.time'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
    { title: t('stat.admin.audit.actor'), dataIndex: 'actor_name', width: 120, render: (v) => v || 'system' },
    {
      title: t('stat.admin.audit.action'),
      dataIndex: 'action',
      width: 170,
      render: (v) => (
        <Tag variant="soft" color="app-blue">
          {v}
        </Tag>
      ),
    },
    { title: t('stat.admin.audit.targetType'), dataIndex: 'target_type', width: 110 },
    { title: t('stat.admin.audit.targetId'), dataIndex: 'target_id', width: 200 },
    {
      title: t('stat.admin.audit.detail'),
      dataIndex: 'detail',
      render: (v) => <span className="stat-audit-detail">{v || '-'}</span>,
    },
  ];

  return (
    <div className="stat-admin-page">
      <StatsAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-yellow">
          {t('stat.admin.audit.title')}
        </Title>
        <div className="table-actions">
          <Select
            value={action}
            onChange={(value) => setAction(value)}
            options={[
              { key: '', label: t('stat.admin.audit.allActions') },
              ...ACTIONS.map((a) => ({ key: a, label: t(`stat.admin.actions.${a}`) })),
            ]}
            aria-label={t('stat.admin.audit.allActions')}
          />
          <Button icon={<RefreshIcon />} loading={loading} disabled={loading} onClick={load}>
            {t('stat.admin.audit.refresh')}
          </Button>
        </div>
      </div>
      <p className="muted-text">{t('stat.admin.audit.tip')}</p>

      <Card>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={{ pageSize: 15, showTotal: true }}
          emptyText={t('common.empty')}
        />
      </Card>
    </div>
  );
}
