import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Input, Notification, Pagination, Progress, Select, Table, Tag, Title } from 'animal-island-ui';
import { AlertTriangleIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';

const RESULT_OPTIONS = ['all', 'found', 'found_self', 'not_found'];

export default function DocsVerifyAdmin() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [result, setResult] = useState('all');
  const [summary, setSummary] = useState(null);
  const pageSize = 12;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, pageSize, q, result });
      const d = await api.get(`/docs/admin/verify-logs?${params.toString()}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
      setItems([]);
    }
  }, [page, q, result, t]);

  const loadSummary = useCallback(() => {
    api
      .get('/docs/admin/verify-summary')
      .then(setSummary)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const pct = summary ? Math.round((summary.failureRate || 0) * 100) : 0;

  const columns = [
    { title: t('docs.verify.historyQuery'), dataIndex: 'query', width: 220 },
    { title: 'IP', dataIndex: 'ip', width: 150 },
    {
      title: t('docs.verify.historyResult'),
      dataIndex: 'result',
      width: 130,
      render: (v) => (
        <Tag color={v === 'not_found' ? 'app-red' : 'app-green'} variant="soft">
          {t(`docs.verify.result.${v}`)}
        </Tag>
      ),
    },
    { title: t('common.createdAt'), dataIndex: 'createdAt', render: (v) => String(v).slice(0, 19).replace('T', ' ') },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.admin.verify.title')}</Title>
      </div>

      {summary?.alerts?.length > 0 && (
        <Card color="app-orange" className="docs-band-card docs-alert">
          <div className="docs-band-head">
            <AlertTriangleIcon size={18} />
            <strong>{t('docs.admin.verify.alertTitle')}</strong>
          </div>
          {summary.alerts.map((a) => (
            <p key={a}>{t(`docs.admin.verify.alert.${a}`)}</p>
          ))}
        </Card>
      )}

      <div className="portal-stats">
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.verify.last24h')}</span>
          <span className="stat-number">{summary?.total ?? '…'}</span>
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.verify.failureRate')}</span>
          <Progress percent={pct} showInfo infoFormat={(p) => `${p}%`} />
        </Card>
        <Card className="stat-card">
          <span className="stat-label">{t('docs.admin.verify.topQueries')}</span>
          <ul className="docs-top-list">
            {(summary?.top || []).map((row) => (
              <li key={row.query}>
                <span className="docs-cell-clip">{row.query}</span>
                <strong>{row.n}</strong>
              </li>
            ))}
            {(!summary?.top || summary.top.length === 0) && <li className="muted-text">{t('common.empty')}</li>}
          </ul>
        </Card>
      </div>

      <Card className="docs-filter-card">
        <div className="docs-filter-row">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('docs.admin.verify.searchPh')} allowClear />
          <Select value={result} onChange={(v) => { setResult(v); setPage(1); }} options={RESULT_OPTIONS.map((r) => ({ key: r, label: r === 'all' ? t('docs.filter.all') : t(`docs.verify.result.${r}`) }))} />
          <Button type="primary" icon={<SearchIcon />} onClick={() => { setPage(1); load(); }}>
            {t('common.search')}
          </Button>
        </div>
      </Card>

      <Card>
        <Table columns={columns} dataSource={items || []} rowKey="id" loading={items === null} emptyText={t('common.empty')} pagination={false} />
        {total > pageSize && (
          <div className="docs-pagination">
            <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
          </div>
        )}
      </Card>
    </div>
  );
}
