import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Pagination, Select, Table, Tag, Title } from 'animal-island-ui';
import { BellIcon, EyeIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { CERT_STATUS_COLORS } from '../../api/docs.js';
import { toastError } from '../../components/toast.js';
import { fmtDate } from '../../lib/date.js';

const STATUS_OPTIONS = ['all', 'valid', 'used', 'expired', 'revoked'];

// 证书状态配色按 UI 规范收敛:已过期用中性棕(共享表仍是 default)。
const STATUS_COLORS = { ...CERT_STATUS_COLORS, expired: 'brown' };

export default function DocsCertificates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const pageSize = 10;

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/docs/certificates?page=${page}&pageSize=${pageSize}&status=${status}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
      setItems([]);
    }
  }, [page, status, t]);

  useEffect(() => {
    load();
  }, [load]);

  const expiringSoon = (cert) => {
    if (cert.status !== 'valid' || !cert.expiresAt) return false;
    const left = new Date(cert.expiresAt).getTime() - Date.now();
    return left < 72 * 60 * 60 * 1000;
  };

  const columns = [
    { title: t('docs.cert.certNo'), dataIndex: 'certNo', width: 190 },
    { title: t('docs.appList.type'), dataIndex: 'typeName', width: 130 },
    { title: t('docs.cert.holder'), dataIndex: 'holderName', width: 110 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      render: (v, row) => (
        <span className="docs-cert-status">
          <Tag color={STATUS_COLORS[v] || 'brown'} variant="soft">
            {t(`docs.certStatus.${v}`)}
          </Tag>
          {expiringSoon(row) && (
            <Tag size="small" color="warm-peach-pink" variant="soft">
              <BellIcon size={12} /> {t('docs.cert.expiringSoon')}
            </Tag>
          )}
        </span>
      ),
    },
    { title: t('docs.cert.issuedAt'), dataIndex: 'issuedAt', width: 110, render: (v) => fmtDate(v) },
    { title: t('docs.cert.expiresAt'), dataIndex: 'expiresAt', width: 110, render: (v) => fmtDate(v) },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, row) => (
        <Button size="small" icon={<EyeIcon />} onClick={() => navigate(`/docs/certificates/${row.id}`)}>
          {t('docs.actions.view')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('docs.certList.title')}</Title>
        </h1>
        <div className="docs-filter">
          <Select
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={STATUS_OPTIONS.map((s) => ({ key: s, label: s === 'all' ? t('docs.filter.all') : t(`docs.certStatus.${s}`) }))}
          />
        </div>
      </div>
      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items || []}
          rowKey="id"
          loading={items === null}
          emptyText={t('docs.certList.empty')}
          pagination={false}
        />
        {total > pageSize && (
          <div className="docs-pagination">
            <Pagination total={total} current={page} pageSize={pageSize} onChange={(p) => setPage(p)} showTotal />
          </div>
        )}
      </Card>
    </div>
  );
}
