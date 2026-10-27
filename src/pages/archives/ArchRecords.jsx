// 我的档案目录 — 只读查询本人在签注/入境两署的归档记录,列表一律脱敏。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { DownloadIcon, EyeIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { ArchNav, OfficeTag, RecordStatusTag, exportCsv, toastArchError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

const OFFICES = [
  { key: '', labelKey: 'arch.catalog.allOffices' },
  { key: 'visa', labelKey: 'arch.office.visa' },
  { key: 'immigration', labelKey: 'arch.office.immigration' },
];

export default function ArchRecords() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [office, setOffice] = useState(searchParams.get('office') || '');
  const [type, setType] = useState(searchParams.get('type') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [types, setTypes] = useState([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (office) params.set('office', office);
    if (type) params.set('type', type);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (keyword) params.set('keyword', keyword);
    api
      .get(`/archives/records?${params}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        toastArchError(err);
        setItems([]);
      });
  }, [page, office, type, from, to, keyword]);

  useEffect(load, [load]);

  useEffect(() => {
    api
      .get('/archives/overview')
      .then((data) => setTypes(data.recordTypes ?? []))
      .catch(() => setTypes([]));
  }, []);

  const search = () => {
    setPage(1);
    load();
  };

  const reset = () => {
    setOffice('');
    setType('');
    setFrom('');
    setTo('');
    setKeyword('');
    setPage(1);
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const params = {};
      if (office) params.office = office;
      if (type) params.type = type;
      if (from) params.from = from;
      if (to) params.to = to;
      if (keyword) params.keyword = keyword;
      const data = await api.post('/archives/records/export', params);
      exportCsv(data.filename, data.columns, data.rows);
      setExportOpen(false);
      toastSuccess(t('arch.catalog.exportDone', { count: data.count }));
      load();
    } catch (err) {
      toastArchError(err);
    } finally {
      setBusy(false);
    }
  };

  const typeOptions = [
    { key: '', label: t('arch.catalog.allTypes') },
    ...types.filter((item) => !office || item.office === office).map((item) => ({ key: item.code, label: item.name })),
  ];

  const columns = [
    { title: t('arch.catalog.typeName'), dataIndex: 'title', width: 130 },
    { title: t('arch.catalog.office'), dataIndex: 'office', width: 110, render: (v) => <OfficeTag office={v} /> },
    { title: t('arch.catalog.no'), dataIndex: 'no', width: 170 },
    { title: t('arch.catalog.date'), dataIndex: 'date', width: 105 },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <RecordStatusTag value={v} /> },
    { title: t('arch.catalog.contact'), dataIndex: 'contact', width: 150, render: (v) => v || <span className="muted-text">-</span> },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 130,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EyeIcon />} onClick={() => navigate(record.sourceUrl)}>
            {t('arch.catalog.view')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="arch-page">
      <ArchNav />
      <div className="page-header">
        <Title size="middle" color="brown">
          {t('arch.catalog.title')}
        </Title>
      </div>

      <Card>
        <div className="arch-toolbar">
          <Select value={office} onChange={(v) => { setOffice(v); setType(''); setPage(1); }} options={OFFICES.map((o) => ({ key: o.key, label: t(o.labelKey) }))} />
          <Select value={type} onChange={(v) => { setType(v); setPage(1); }} options={typeOptions} />
          <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder={t('arch.catalog.from')} maxLength={10} />
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('arch.catalog.to')} maxLength={10} />
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={t('arch.catalog.keyword')} allowClear maxLength={60} />
          <Button type="primary" icon={<SearchIcon />} onClick={search}>
            {t('common.search')}
          </Button>
          <Button onClick={reset}>{t('arch.catalog.reset')}</Button>
        </div>
        <p className="arch-note arch-toolbar-note">{t('arch.catalog.maskedTip')}</p>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey={(r) => `${r.recordType}:${r.id}`}
          pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
          emptyText={t('arch.catalog.empty')}
        />
        <div className="arch-tag-row arch-export-row">
          <Tag color="brown" variant="soft" size="small">
            {t('arch.catalog.readOnlyTip')}
          </Tag>
          <Button type="text" size="small" icon={<DownloadIcon />} onClick={() => setExportOpen(true)} disabled={!items?.length}>
            {t('arch.catalog.export')}
          </Button>
        </div>
      </Card>

      <Modal
        maskClosable={false}
        open={exportOpen}
        title={t('arch.catalog.exportTitle')}
        onClose={() => (busy ? undefined : setExportOpen(false))}
        typewriter={false}
        footer={
          <>
            <Button disabled={busy} onClick={() => setExportOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy} onClick={doExport}>
              {t('arch.catalog.exportConfirm')}
            </Button>
          </>
        }
      >
        <p>{t('arch.catalog.exportTip')}</p>
        <p className="arch-note">{t('arch.catalog.exportNote')}</p>
      </Modal>
    </div>
  );
}