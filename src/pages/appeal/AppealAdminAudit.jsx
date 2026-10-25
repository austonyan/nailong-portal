// 审计与合规:敏感操作审计日志、验真记录、导出留痕查询。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Table, Tabs, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastAppealError } from './shared.jsx';

export default function AppealAdminAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [verifyLogs, setVerifyLogs] = useState([]);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, v] = await Promise.all([
        api.get(`/appeal/admin/audit${action.trim() ? `?action=${encodeURIComponent(action.trim())}` : ''}`),
        api.get('/appeal/admin/verify-logs'),
      ]);
      setItems(a.items);
      setVerifyLogs(v.items);
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setLoading(false);
    }
  }, [action, t]);

  useEffect(() => {
    load();
  }, [load]);

  const auditColumns = [
    { title: t('appeal.audit.colActor'), dataIndex: 'actor_name', width: 130 },
    { title: t('appeal.audit.colAction'), dataIndex: 'action', width: 200 },
    { title: t('appeal.audit.colTarget'), width: 180, render: (_v, r) => `${t(`appeal.audit.target.${r.target_type}`, { defaultValue: r.target_type })} ${r.target_id}` },
    { title: t('appeal.audit.colDetail'), dataIndex: 'detail', render: (v) => <span className="muted-text">{v}</span> },
    { title: t('appeal.audit.colTime'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
  ];

  const verifyColumns = [
    { title: t('appeal.audit.colQuery'), dataIndex: 'query', width: 220 },
    { title: t('appeal.audit.colIp'), dataIndex: 'ip', width: 160 },
    {
      title: t('appeal.audit.colResult'),
      dataIndex: 'result',
      width: 160,
      render: (v) => (
        <Tag variant="soft" color={v === 'rate_limited' ? 'app-red' : v.includes('valid') || v.includes('valid') ? 'app-green' : 'default'}>
          {v}
        </Tag>
      ),
    },
    { title: t('appeal.audit.colTime'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
  ];

  return (
    <div className="appeal-admin-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.audit.title')}</Title>
      </div>

      <Card>
        <Tabs
          activeKey="audit"
          items={[
            {
              key: 'audit',
              label: t('appeal.audit.tabAudit'),
              children: (
                <>
                  <div className="table-actions appeal-filter-bar">
                    <Input
                      size="middle"
                      allowClear
                      prefix={<SearchIcon size={14} />}
                      placeholder={t('appeal.audit.searchPlaceholder')}
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                    />
                    <Button onClick={load}>{t('appeal.audit.refresh')}</Button>
                  </div>
                  <Table columns={auditColumns} dataSource={items} loading={loading} rowKey="id" pagination={false} emptyText={t('common.empty')} />
                </>
              ),
            },
            {
              key: 'verify',
              label: t('appeal.audit.tabVerify'),
              children: (
                <>
                  <p className="muted-text">{t('appeal.audit.verifyTip')}</p>
                  <Table columns={verifyColumns} dataSource={verifyLogs} loading={loading} rowKey="id" pagination={false} emptyText={t('common.empty')} />
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
