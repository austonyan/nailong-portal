// 跨署互认规则管理台:配置"持 A 证件可免办/简化/优先办 B 业务"。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Switch, Table, Tag, Title } from 'animal-island-ui';
import { PlusIcon, RefreshIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastSuccess, toastError } from '../../components/toast.js';

const SERVICES = ['visa', 'immigration', 'resident', 'dip', 'protocol', 'docs', 'appeal', 'archives'];
const SOURCES = ['visa', 'immigration', 'resident', 'diplomatic', 'document', 'protocol', 'appeal', 'archives'];
const EFFECTS = ['simplify', 'waive', 'priority'];

const EMPTY_FORM = {
  serviceKey: 'visa',
  holderSource: 'resident',
  holderKind: 'card',
  effect: 'simplify',
  benefit: '',
  benefitTw: '',
  enabled: true,
  sortOrder: 0,
};

const EFFECT_COLOR = { simplify: 'app-yellow', waive: 'app-green', priority: 'app-teal' };

export default function AdminRecognize() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/recognize');
      setItems(data.items ?? []);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing({});
    setForm(EMPTY_FORM);
  };

  const openEdit = (row) => {
    setEditing(row);
    // row 里的 benefit 已被 localeMiddleware 按当前界面语言改写(繁中模式下是
    // 繁体),直接 {...row} 会把繁体存进简体字段。简体绑 benefitCn ?? benefit,
    // 繁体绑 benefitTw,提交时两者都带上。
    setForm({
      ...row,
      benefit: row.benefitCn ?? row.benefit ?? '',
      benefitTw: row.benefitTw ?? '',
    });
  };

  const closeModal = () => {
    if (busy) return;
    setEditing(null);
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!String(form.benefit || '').trim()) {
      toastError(t('recognizeAdmin.benefitRequired'));
      return;
    }
    setBusy(true);
    try {
      if (editing.id) {
        await api.patch(`/recognize/${editing.id}`, form);
        toastSuccess(t('recognizeAdmin.updated'));
      } else {
        await api.post('/recognize', form);
        toastSuccess(t('recognizeAdmin.created'));
      }
      setEditing(null);
      await load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row) => {
    try {
      await api.patch(`/recognize/${row.id}`, { enabled: !row.enabled });
      await load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.del(`/recognize/${deleteTarget.id}`);
      toastSuccess(t('common.deleted'));
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      title: t('recognizeAdmin.service'),
      dataIndex: 'serviceKey',
      render: (v) => t(`recognizeAdmin.serviceKey.${v}`),
    },
    {
      title: t('recognizeAdmin.holderSource'),
      dataIndex: 'holderSource',
      render: (v) => t(`linkage.office.${v}`),
    },
    { title: t('recognizeAdmin.holderKind'), dataIndex: 'holderKind', render: (v) => v || '-' },
    {
      title: t('recognizeAdmin.effect'),
      dataIndex: 'effect',
      render: (v) => (
        <Tag color={EFFECT_COLOR[v] || 'default'} variant="soft">
          {t(`recognizeAdmin.effects.${v}`)}
        </Tag>
      ),
    },
    { title: t('recognizeAdmin.benefit'), dataIndex: 'benefit' },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      render: (v, record) => <Switch size="small" checked={!!v} onChange={() => toggle(record)} />,
    },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_, record) => (
        <div className="table-actions">
          <Button size="small" onClick={() => openEdit(record)}>
            {t('common.edit')}
          </Button>
          <Button size="small" danger onClick={() => setDeleteTarget(record)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('recognizeAdmin.title')}</Title>
        <p className="muted-text">{t('recognizeAdmin.subtitle')}</p>
        <div className="table-actions">
          <Button icon={<RefreshIcon />} onClick={load} loading={loading}>
            {t('common.refresh')}
          </Button>
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('recognizeAdmin.create')}
          </Button>
        </div>
      </div>
      <Card>
        <Table className="table-fit"
          columns={columns}
          dataSource={items}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20, showTotal: true }}
          emptyText={t('recognizeAdmin.empty')}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={editing !== null}
        title={editing?.id ? t('recognizeAdmin.edit') : t('recognizeAdmin.create')}
        onClose={closeModal}
        typewriter={false}
        footer={
          <>
            <Button onClick={closeModal} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" loading={busy} disabled={busy} onClick={save}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="recognize-form">
          <label className="recognize-field">
            <span>{t('recognizeAdmin.service')}</span>
            <Select
              value={form.serviceKey}
              onChange={(v) => setField('serviceKey', v)}
              options={SERVICES.map((s) => ({ key: s, label: t(`recognizeAdmin.serviceKey.${s}`) }))}
            />
          </label>
          <label className="recognize-field">
            <span>{t('recognizeAdmin.holderSource')}</span>
            <Select
              value={form.holderSource}
              onChange={(v) => setField('holderSource', v)}
              options={SOURCES.map((s) => ({ key: s, label: t(`linkage.office.${s}`) }))}
            />
          </label>
          <label className="recognize-field">
            <span>{t('recognizeAdmin.holderKind')}</span>
            <Input value={form.holderKind} onChange={(e) => setField('holderKind', e.target.value)} placeholder="card / permit / identity" allowClear />
          </label>
          <label className="recognize-field">
            <span>{t('recognizeAdmin.effect')}</span>
            <Select
              value={form.effect}
              onChange={(v) => setField('effect', v)}
              options={EFFECTS.map((e) => ({ key: e, label: t(`recognizeAdmin.effects.${e}`) }))}
            />
          </label>
          <label className="recognize-field">
            <span>{t('recognizeAdmin.benefit')}</span>
            <Input value={form.benefit} onChange={(e) => setField('benefit', e.target.value)} allowClear />
          </label>
          <label className="recognize-field">
            <span>{t('recognizeAdmin.benefitTw')}</span>
            <Input value={form.benefitTw || ''} onChange={(e) => setField('benefitTw', e.target.value)} allowClear />
          </label>
          <label className="recognize-field recognize-field-inline">
            <span>{t('common.status')}</span>
            <Switch checked={form.enabled} onChange={(v) => setField('enabled', v)} />
          </label>
        </div>
      </Modal>

      <Modal
        maskClosable={false}
        open={deleteTarget !== null}
        title={t('recognizeAdmin.delete')}
        onClose={() => !busy && setDeleteTarget(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" danger loading={busy} disabled={busy} onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {deleteTarget ? t('recognizeAdmin.deleteConfirm', { benefit: deleteTarget.benefit }) : ''}
      </Modal>
    </div>
  );
}
