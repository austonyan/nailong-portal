// 统计口径管理:指标双语定义、来源署与来源表、状态筛选、启停与软删除。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Switch, Table, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { toastSuccess } from '../../../components/toast.js';
import { StatsAdminNav } from '../StatsShell.jsx';
import { TextArea, toastStatError } from '../shared.jsx';

const OFFICES = [
  'portal',
  'visa',
  'immigration',
  'dip',
  'resident',
  'protocol',
  'docs',
  'appeal',
  'tourism',
  'postal',
  'archives',
  'stats',
  'education',
];

const EMPTY_FORM = {
  id: null,
  code: '',
  name: '',
  nameTw: '',
  description: '',
  descriptionTw: '',
  formula: '',
  formulaTw: '',
  sourceOffice: 'stats',
  tableName: '',
  statusValue: '',
  enabled: true,
  sortOrder: '0',
};

export default function AdminStatMetrics() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [sources, setSources] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/stats/admin/metrics');
      setItems(data.items);
      setSources(data.sources ?? []);
    } catch (err) {
      toastStatError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const officeOptions = OFFICES.map((key) => ({ key, label: t(`stat.office.${key}`) }));
  const tableOptions = sources
    .filter((source) => source.office === form.sourceOffice)
    .map((source) => ({ key: source.table, label: source.table }));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setForm({
      id: row.id,
      code: row.code,
      name: row.nameCn ?? row.name,
      nameTw: row.nameTw ?? '',
      description: row.descriptionCn ?? row.description ?? '',
      descriptionTw: row.descriptionTw ?? '',
      formula: row.formulaCn ?? row.formula ?? '',
      formulaTw: row.formulaTw ?? '',
      sourceOffice: row.sourceOffice,
      tableName: row.tableName,
      statusValue: row.statusValue ?? '',
      enabled: row.enabled,
      sortOrder: String(row.sortOrder ?? 0),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setModalOpen(false);
  };

  const canSave = form.code.trim() && form.name.trim() && form.tableName;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        nameTw: form.nameTw.trim(),
        description: form.description,
        descriptionTw: form.descriptionTw,
        formula: form.formula,
        formulaTw: form.formulaTw,
        sourceOffice: form.sourceOffice,
        tableName: form.tableName,
        statusValue: form.statusValue.trim(),
        enabled: form.enabled,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (form.id) await api.patch(`/stats/admin/metrics/${form.id}`, body);
      else await api.post('/stats/admin/metrics', body);
      setModalOpen(false);
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastStatError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const closeRemove = () => {
    if (removeBusy) return;
    setRemoving(null);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await api.del(`/stats/admin/metrics/${removing.id}`);
      setRemoving(null);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastStatError(t, err);
    } finally {
      setRemoveBusy(false);
    }
  };

  const columns = [
    { title: t('stat.admin.metrics.code'), dataIndex: 'code', width: 150 },
    {
      title: t('stat.admin.metrics.name'),
      dataIndex: 'name',
      width: 140,
      render: (v, row) => (
        <div>
          <div>{v}</div>
          <div className="muted-text">{row.nameCn ?? row.nameTw ?? '-'}</div>
        </div>
      ),
    },
    {
      title: t('stat.admin.metrics.sourceOffice'),
      dataIndex: 'sourceOffice',
      width: 110,
      render: (v) => (
        <Tag variant="soft" color="app-blue">
          {t(`stat.office.${v}`)}
        </Tag>
      ),
    },
    { title: t('stat.admin.metrics.sourceTable'), dataIndex: 'tableName', width: 170 },
    {
      title: t('stat.admin.metrics.statusValue'),
      dataIndex: 'statusValue',
      width: 110,
      render: (v) => v || '-',
    },
    {
      title: t('stat.admin.metrics.value'),
      dataIndex: 'value',
      width: 90,
      render: (v, row) => (row.available ? v : '-'),
    },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 90,
      render: (v) => (
        <Tag variant="soft" color={v ? 'app-green' : 'brown'}>
          {v ? t('common.enabled') : t('common.disabled')}
        </Tag>
      ),
    },
    {
      title: t('stat.admin.metrics.sortOrder'),
      dataIndex: 'sortOrder',
      width: 80,
    },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 160,
      render: (_, row) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EditIcon />} onClick={() => openEdit(row)}>
            {t('common.edit')}
          </Button>
          <Button type="text" size="small" icon={<TrashIcon />} onClick={() => setRemoving(row)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="stat-admin-page">
      <StatsAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('stat.admin.metrics.title')}
          </Title>
        </h1>
        <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
          {t('stat.admin.metrics.create')}
        </Button>
      </div>
      <p className="muted-text">{t('stat.admin.metrics.tip')}</p>

      <Card>
        <Table
          className="table-fit"
          columns={columns}
          dataSource={items ?? []}
          loading={items === null}
          rowKey="id"
          pagination={false}
          emptyText={t('common.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={modalOpen}
        title={form.id ? t('stat.admin.metrics.edit') : t('stat.admin.metrics.create')}
        onClose={closeModal}
        typewriter={false}
        width={680}
        footer={
          <>
            <Button onClick={closeModal} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy || !canSave} onClick={save}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="stat-form-grid">
          <label>
            <span>
              {t('stat.admin.metrics.code')} <span className="stat-required">*</span>
            </span>
            <Input
              size="large"
              value={form.code}
              placeholder={t('stat.admin.metrics.codePlaceholder')}
              onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
            />
          </label>
          <label>
            <span>
              {t('stat.admin.metrics.name')} <span className="stat-required">*</span>
            </span>
            <Input size="large" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            <span>
              {t('stat.admin.metrics.name')} · {t('common.traditional')}
            </span>
            <Input
              size="large"
              value={form.nameTw}
              placeholder={t('common.twOptional')}
              onChange={(e) => setForm({ ...form, nameTw: e.target.value })}
            />
          </label>
          <label>
            <span>{t('stat.admin.metrics.sourceOffice')}</span>
            <Select
              value={form.sourceOffice}
              onChange={(value) => setForm({ ...form, sourceOffice: value, tableName: '', statusValue: '' })}
              options={officeOptions}
            />
          </label>
          <label>
            <span>
              {t('stat.admin.metrics.sourceTable')} <span className="stat-required">*</span>
            </span>
            <Select
              value={form.tableName}
              onChange={(value) => setForm({ ...form, tableName: value, statusValue: '' })}
              options={tableOptions}
              placeholder={t('stat.admin.metrics.tablePlaceholder')}
            />
          </label>
          <label>
            <span>{t('stat.admin.metrics.statusValue')}</span>
            <Input
              size="large"
              value={form.statusValue}
              placeholder={t('stat.admin.metrics.statusValuePlaceholder')}
              onChange={(e) => setForm({ ...form, statusValue: e.target.value.toLowerCase() })}
            />
          </label>
          <label>
            <span>{t('stat.admin.metrics.sortOrder')}</span>
            <Input size="large" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </label>
          <div className="stat-form-row">
            <span>{t('common.enabled')}</span>
            <Switch checked={!!form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} />
          </div>
        </div>

        <p className="muted-text">{t('stat.admin.metrics.statusTip')}</p>

        <label className="stat-form-row">
          <span>{t('stat.admin.metrics.description')}</span>
          <TextArea
            rows={2}
            maxLength={300}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className="stat-form-row">
          <span>
            {t('stat.admin.metrics.description')} · {t('common.traditional')}
          </span>
          <TextArea
            rows={2}
            maxLength={300}
            value={form.descriptionTw}
            placeholder={t('common.twOptional')}
            onChange={(e) => setForm({ ...form, descriptionTw: e.target.value })}
          />
        </label>
        <label className="stat-form-row">
          <span>{t('stat.admin.metrics.formula')}</span>
          <TextArea
            rows={3}
            maxLength={1000}
            value={form.formula}
            onChange={(e) => setForm({ ...form, formula: e.target.value })}
          />
        </label>
        <label className="stat-form-row">
          <span>
            {t('stat.admin.metrics.formula')} · {t('common.traditional')}
          </span>
          <TextArea
            rows={3}
            maxLength={1000}
            value={form.formulaTw}
            placeholder={t('common.twOptional')}
            onChange={(e) => setForm({ ...form, formulaTw: e.target.value })}
          />
        </label>
      </Modal>

      <Modal
        maskClosable={false}
        open={!!removing}
        title={t('common.confirmDeleteTitle')}
        onClose={closeRemove}
        typewriter={false}
        footer={
          <>
            <Button onClick={closeRemove} disabled={removeBusy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={removeBusy} disabled={removeBusy} onClick={confirmRemove}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p>{t('stat.admin.metrics.deleteConfirm', { name: removing?.name ?? '' })}</p>
        <p className="muted-text">{t('common.deleteTip')}</p>
      </Modal>
    </div>
  );
}