import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Pagination, Select, Table, Tag, Title } from 'animal-island-ui';
import { RefreshIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { CERT_STATUS_COLORS } from '../../../api/docs.js';
import { toastSuccess, toastError } from '../../../components/toast.js';
import { fmtDate } from '../../../lib/date.js';
import { useDebouncedValue } from '../../../lib/useDebouncedValue.js';

const STATUS_OPTIONS = ['all', 'valid', 'used', 'expired', 'revoked'];

export default function DocsCertsAdmin() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [typeCode, setTypeCode] = useState('all');
  const [q, setQ] = useState('');
  // 检索词 300ms 防抖:逐键输入不再每字打一次接口。
  const dq = useDebouncedValue(q, 300);
  const [types, setTypes] = useState([]);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [regenTarget, setRegenTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: page, pageSize: pageSize, status: status, typeCode: typeCode, q: dq });
      const d = await api.get(`/docs/admin/certificates?${params.toString()}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
      setItems([]);
    }
  }, [page, status, typeCode, dq, t]);

  useEffect(() => {
    api.get('/docs/admin/types').then((d) => setTypes(d.items)).catch(() => setTypes([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const revoke = async () => {
    if (!revokeTarget) return;
    if (!revokeReason.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/docs/admin/certificates/${revokeTarget.id}/revoke`, { reason: revokeReason });
      toastSuccess(t('common.save'));
      setRevokeTarget(null);
      setRevokeReason('');
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const markUsed = async (row) => {
    try {
      await api.post(`/docs/admin/certificates/${row.id}/mark-used`);
      toastSuccess(t('common.saved'));
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  const regenerate = async () => {
    if (!regenTarget) return;
    setBusy(true);
    try {
      await api.post(`/docs/admin/certificates/${regenTarget.id}/regenerate`);
      toastSuccess(t('docs.admin.certs.regenerated'));
      setRegenTarget(null);
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { title: t('docs.cert.certNo'), dataIndex: 'certNo', width: 190 },
    { title: t('docs.appList.type'), dataIndex: 'typeName', width: 120 },
    { title: t('docs.cert.holder'), dataIndex: 'holderName', width: 100 },
    { title: t('docs.admin.review.username'), dataIndex: 'username', width: 100 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 90,
      render: (v) => (
        <Tag color={CERT_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`docs.certStatus.${v}`)}
        </Tag>
      ),
    },
    { title: t('docs.cert.issuedAt'), dataIndex: 'issuedAt', width: 105, render: (v) => fmtDate(v) },
    { title: t('docs.cert.expiresAt'), dataIndex: 'expiresAt', width: 105, render: (v) => fmtDate(v) },
    {
      title: t('common.actions'),
      width: 200,
      render: (_, row) => (
        <div className="table-actions">
          {row.status === 'valid' && (
            <>
              <Button size="small" onClick={() => markUsed(row)}>
                {t('docs.admin.certs.markUsed')}
              </Button>
              <Button size="small" danger onClick={() => setRevokeTarget(row)}>
                {t('docs.admin.certs.revoke')}
              </Button>
            </>
          )}
          {row.status !== 'valid' && (
            <Button size="small" icon={<RefreshIcon />} onClick={() => setRegenTarget(row)}>
              {t('docs.admin.certs.regenerate')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.admin.certs.title')}</Title>
      </div>
      <Card className="docs-filter-card">
        <div className="docs-filter-row">
          <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS.map((s) => ({ key: s, label: s === 'all' ? t('docs.filter.all') : t(`docs.certStatus.${s}`) }))} />
          <Select value={typeCode} onChange={(v) => { setTypeCode(v); setPage(1); }} options={[{ key: 'all', label: t('docs.filter.allTypes') }, ...types.map((tp) => ({ key: tp.code, label: tp.name }))]} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('docs.admin.certs.searchPh')} allowClear />
          <Button type="primary" icon={<SearchIcon />} onClick={() => { setPage(1); load(); }}>
            {t('common.search')}
          </Button>
        </div>
      </Card>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items || []} rowKey="id" loading={items === null} emptyText={t('common.empty')} pagination={false} />
        {total > pageSize && (
          <div className="docs-pagination">
            <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
          </div>
        )}
      </Card>

      <Modal
        open={!!revokeTarget}
        title={t('docs.admin.certs.revokeTitle', { no: revokeTarget?.certNo })}
        typewriter={false}
        onClose={() => {
          if (!busy) setRevokeTarget(null);
        }}
        maskClosable={false}
        footer={
          <>
            <Button onClick={() => setRevokeTarget(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} disabled={busy || !revokeReason.trim()} onClick={revoke}>
              {t('docs.admin.certs.revoke')}
            </Button>
          </>
        }
      >
        <p className="muted-text">{t('docs.admin.certs.revokeTip')}</p>
        <Input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder={t('docs.admin.certs.revokeReasonPh')} maxLength={300} />
      </Modal>

      <Modal
        maskClosable={false}
        open={!!regenTarget}
        title={t('docs.admin.certs.regenerateTitle', { no: regenTarget?.certNo })}
        typewriter={false}
        onClose={() => setRegenTarget(null)}
        footer={
          <>
            <Button onClick={() => setRegenTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={regenerate} disabled={busy}>
              {t('docs.admin.certs.regenerate')}
            </Button>
          </>
        }
      >
        <p>{t('docs.admin.certs.regenerateTip')}</p>
      </Modal>
    </div>
  );
}
