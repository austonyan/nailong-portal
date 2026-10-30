// 审计与合规:敏感操作审计日志、验真记录、导出留痕查询。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Table, Tabs, Tag, Title } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastAppealError } from './shared.jsx';

// 验真记录里的 result 形如 `decision:valid` / `appeal:resolved` / `not_found`。
// 不能再用 includes('valid')(会把 invalid 也染成绿色),按枚举直查。
const VERIFY_RESULT_COLORS = {
  valid: 'app-green',
  completed: 'app-green',
  resolved: 'app-green',
  not_found: 'app-red',
  rate_limited: 'app-red',
  expired: 'brown',
  voided: 'brown',
  rejected: 'app-red',
};

function VerifyResultTag({ value }) {
  const { t } = useTranslation();
  const raw = String(value ?? '');
  const [kind, status] = raw.includes(':') ? raw.split(':') : [null, raw];
  const label = kind
    ? `${t(`appeal.audit.kind.${kind}`, { defaultValue: t('common.unknown') })} · ${t(`appeal.audit.result.${status}`, { defaultValue: t('common.unknown') })}`
    : t(`appeal.audit.result.${raw}`, { defaultValue: t('common.unknown') });
  return (
    <Tag variant="soft" color={VERIFY_RESULT_COLORS[status] || 'brown'}>
      {label}
    </Tag>
  );
}

export default function AppealAdminAudit() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [verifyLogs, setVerifyLogs] = useState([]);
  const [action, setAction] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, v] = await Promise.all([
        api.get(`/appeal/admin/audit${query ? `?action=${encodeURIComponent(query)}` : ''}`),
        api.get('/appeal/admin/verify-logs'),
      ]);
      setItems(a.items);
      setVerifyLogs(v.items);
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setLoading(false);
    }
  }, [query, t]);

  useEffect(() => {
    load();
  }, [load]);

  const auditColumns = [
    { title: t('appeal.audit.colActor'), dataIndex: 'actor_name', width: 130 },
    { title: t('appeal.audit.colAction'), dataIndex: 'action', width: 200, render: (v) => t(`appeal.audit.action.${v}`, { defaultValue: t('common.unknown') }) },
    { title: t('appeal.audit.colTarget'), width: 180, render: (_v, r) => `${t(`appeal.audit.target.${r.target_type}`, { defaultValue: t('common.unknown') })} ${r.target_id}` },
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
      render: (v) => <VerifyResultTag value={v} />,
    },
    { title: t('appeal.audit.colTime'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
  ];

  return (
    <div className="appeal-admin-page">
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('appeal.audit.title')}</Title>
        </h1>
      </div>

      <Card>
        <Tabs
          defaultActiveKey="audit"
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setQuery(action.trim());
                      }}
                      onClear={() => {
                        setAction('');
                        setQuery('');
                      }}
                    />
                    <Button
                      icon={<SearchIcon />}
                      onClick={() => setQuery(action.trim())}
                    >
                      {t('common.search')}
                    </Button>
                    <Button onClick={load}>{t('appeal.audit.refresh')}</Button>
                  </div>
                  <Table className="table-fit" columns={auditColumns} dataSource={items} loading={loading} rowKey="id" pagination={false} emptyText={t('common.empty')} />
                </>
              ),
            },
            {
              key: 'verify',
              label: t('appeal.audit.tabVerify'),
              children: (
                <>
                  <p className="muted-text">{t('appeal.audit.verifyTip')}</p>
                  <Table className="table-fit" columns={verifyColumns} dataSource={verifyLogs} loading={loading} rowKey="id" pagination={false} emptyText={t('common.empty')} />
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
