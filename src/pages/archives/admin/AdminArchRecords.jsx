// 档案查询(管理端) — 按用户/编号/类型查,脱敏展示;导出需二次确认并写审计。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { DownloadIcon, SearchIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ArchAdminNav, OfficeTag, RecordStatusTag, exportCsv, toastArchError } from '../shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

const OFFICES = [
  { key: '', labelKey: 'arch.catalog.allOffices' },
  { key: 'visa', labelKey: 'arch.office.visa' },
  { key: 'immigration', labelKey: 'arch.office.immigration' },
];

export default function AdminArchRecords() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState('');
  const [no, setNo] = useState('');
  const [office, setOffice] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [types, setTypes] = useState([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (userId) params.set('userId', userId);
    if (no) params.set('no', no);
    if (office) params.set('office', office);
    if (type) params.set('type', type);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (keyword) params.set('keyword', keyword);
    api
      .get(`/archives/admin/records?${params}`)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        toastArchError(err);
        setItems([]);
      });
  }, [page, userId, no, office, type, from, to, keyword]);

  useEffect(load, [load]);

  useEffect(() => {
    api
      .get('/archives/admin/rules')
      .then((data) => setTypes(data.items ?? []))
      .catch(() => setTypes([]));
  }, []);

  const search = () => {
    setPage(1);
    load();
  };

  const reset = () => {
    setUserId('');
    setNo('');
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
      const params = { confirm: true };
      if (userId) params.userId = userId;
      if (no) params.no = no;
      if (office) params.office = office;
      if (type) params.type = type;
      if (from) params.from = from;
      if (to) params.to = to;
      if (keyword) params.keyword = keyword;
      const data = await api.post('/archives/admin/records/export', params);
      exportCsv(data.filename, data.columns, data.rows);
      setExportOpen(false);
      toastSuccess(t('arch.admin.records.exportDone', { count: data.count }));
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
    {
      title: t('arch.admin.records.applicant'),
      dataIndex: 'owner',
      width: 150,
      render: (v) => (v ? `${v.displayName || v.username} (@${v.username})` : <span className="muted-text">-</span>),
    },
    { title: t('arch.catalog.typeName'), dataIndex: 'title', width: 120 },
    { title: t('arch.catalog.office'), dataIndex: 'office', width: 110, render: (v) => <OfficeTag office={v} /> },
    { title: t('arch.catalog.no'), dataIndex: 'no', width: 170 },
    { title: t('arch.catalog.date'), dataIndex: 'date', width: 100 },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <RecordStatusTag value={v} /> },
    { title: t('arch.catalog.contact'), dataIndex: 'contact', width: 140, render: (v) => v || <span className="muted-text">-</span> },
    {
      title: t('arch.admin.records.hidden'),
      dataIndex: 'hidden',
      width: 90,
      render: (v) =>
        v ? (
          <span className="arch-hidden-tag">{t('arch.admin.records.hiddenYes')}</span>
        ) : (
          <span className="muted-text">-</span>
        ),
    },
  ];

  return (
    <div className="arch-page">
      <ArchAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="brown">
            {t('arch.admin.records.title')}
          </Title>
        </h1>
        <Button type="primary" icon={<DownloadIcon />} onClick={() => setExportOpen(true)} disabled={!items?.length}>
          {t('arch.admin.records.export')}
        </Button>
      </div>

      <Card>
        <div className="arch-toolbar">
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={t('arch.admin.records.userId')} allowClear maxLength={20} />
          <Input value={no} onChange={(e) => setNo(e.target.value)} placeholder={t('arch.admin.records.no')} allowClear maxLength={60} />
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
        <p className="arch-note arch-toolbar-note">
          <Tag color="brown" variant="soft" size="small">
            {t('arch.admin.records.maskedTip')}
          </Tag>
        </p>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey={(r) => `${r.recordType}:${r.id}`}
          pagination={{ current: page, pageSize, total, onChange: (p) => setPage(p), showTotal: true }}
          emptyText={t('arch.catalog.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={exportOpen}
        title={t('arch.admin.records.exportTitle')}
        onClose={() => (busy ? undefined : setExportOpen(false))}
        typewriter={false}
        footer={
          <>
            <Button disabled={busy} onClick={() => setExportOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy} onClick={doExport}>
              {t('arch.admin.records.exportConfirm')}
            </Button>
          </>
        }
      >
        <p>{t('arch.admin.records.exportTip')}</p>
      </Modal>
    </div>
  );
}