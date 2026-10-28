// 统一证件库:聚合当前账户各署本人有效证件,跨署统一查看与到期提醒。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Table, Tag, Title } from 'animal-island-ui';
import { LinkIcon } from 'naive-icons';
import dayjs from 'dayjs';
import { api } from '../../api/client.js';
import { toastError } from '../../components/toast.js';

const OFFICE_ROUTE = {
  visa: '/visa/permits',
  immigration: '/immigration/records',
  resident: '/resident/card',
  diplomatic: '/dip/identity',
  document: '/docs/certificates',
  protocol: '/protocol/invitations',
  archives: '/archives/records',
};

const STATUS_COLOR = {
  valid: 'app-green',
  issued: 'app-teal',
  approved: 'app-green',
  entered: 'app-green',
  exited: 'app-green',
  established: 'app-green',
  active: 'app-green',
  pending: 'app-yellow',
  used: 'app-blue',
  expired: 'brown',
  voided: 'app-red',
  rejected: 'app-red',
};

export default function Certificates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [benefits, setBenefits] = useState([]);
  const [loading, setLoading] = useState(false);

  const fmtDate = (iso) => (iso ? dayjs(iso).format('YYYY-MM-DD') : '-');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const safeRec = (service) => api.get(`/recognize/me/${service}`).catch(() => ({ items: [] }));
      const [certData, alertData, ...recs] = await Promise.all([
        api.get('/linkage/certificates'),
        api.get('/linkage/alerts'),
        ...['visa', 'immigration', 'protocol', 'docs'].map(safeRec),
      ]);
      setItems(certData.certificates ?? []);
      setAlerts(alertData.alerts ?? []);
      setBenefits(recs.flatMap((r) => r.items ?? []).filter((i) => i.eligible));
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
      setItems([]);
      setAlerts([]);
      setBenefits([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const expiringCount = items.filter((i) => i.expiringSoon).length;

  const goOffice = (source) => {
    const to = OFFICE_ROUTE[source];
    if (to) navigate(to);
  };

  const columns = [
    { title: t('certificates.column.office'), dataIndex: 'office', width: 150 },
    {
      title: t('certificates.column.type'),
      dataIndex: 'kind',
      width: 110,
      render: (_, record) => (
        <span>{t(`linkage.kind.${record.kind}`, { defaultValue: record.kind })}</span>
      ),
    },
    { title: t('certificates.column.number'), dataIndex: 'code', width: 170 },
    {
      title: t('certificates.column.status'),
      dataIndex: 'status',
      width: 110,
      render: (_, record) => (
        <Tag color={STATUS_COLOR[record.status] || 'default'} variant="soft">
          {t(`certificates.status.${record.status}`, { defaultValue: record.status })}
        </Tag>
      ),
    },
    { title: t('certificates.column.validUntil'), dataIndex: 'validUntil', width: 140, render: fmtDate },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<LinkIcon />} onClick={() => goOffice(record.source)}>
            {t('certificates.goTo', { office: t(`linkage.office.${record.source}`, { defaultValue: record.source }) })}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('certificates.title')}</Title>
        <p className="muted-text">{t('certificates.subtitle')}</p>
        {expiringCount > 0 && (
          <Card type="dashed" className="certificates-expiring">
            <Tag color="app-orange" variant="soft">{expiringCount}</Tag>
            <span>{t('certificates.expiringSoon')}</span>
          </Card>
        )}
        <Button onClick={load} loading={loading}>{t('certificates.refresh')}</Button>
      </div>

      {alerts.length > 0 && (
        <Card type="dashed" className="certificates-alerts">
          <Title variant="layer" color="app-orange" size="small">{t('certificates.alert.title')}</Title>
          <ul className="certificates-alert-list">
            {alerts.map((a) => (
              <li key={a.type}>
                {a.type === 'resident_card_invalid'
                  ? t('certificates.alert.residentCardInvalid', { status: a.cardStatus, count: a.affectedCount })
                  : t('certificates.alert.diplomaticOrphaned', { count: a.affectedCount })}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {benefits.length > 0 && (
        <Card type="dashed" className="certificates-benefits">
          <Title variant="layer" color="app-teal" size="small">{t('certificates.benefits.title')}</Title>
          <ul className="certificates-benefit-list">
            {benefits.map((b) => (
              <li key={`${b.serviceKey}-${b.id}`}>
                <Tag size="small" color="app-teal" variant="soft">
                  {t(`recognizeAdmin.serviceKey.${b.serviceKey}`, { defaultValue: b.serviceKey })}
                </Tag>
                <span>{b.benefit}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items}
          loading={loading}
          rowKey="code"
          pagination={{ pageSize: 20, showTotal: true }}
          emptyText={t('certificates.empty')}
        />
      </Card>
    </div>
  );
}
