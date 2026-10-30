import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Switch, Table, Tag, Title } from 'animal-island-ui';
import { PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import DocsTextarea from '../../../components/DocsTextarea.jsx';
import { toastSuccess, toastError } from '../../../components/toast.js';

const emptyMaterial = { key: '', label: '', required: true, accept: 'image/*,application/pdf', max_mb: 10, max_count: 3 };
const emptyField = { key: '', label: '', required: false, max: 120, placeholder: '' };

function ListEditor({ labelKey, rows, setRows, makeEmpty, columns }) {
  const { t } = useTranslation();
  return (
    <div className="docs-list-editor">
      {rows.map((row, idx) => (
        <div className="docs-list-editor-row" key={idx}>
          {columns(row, (patch) => setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))))}
          <Button size="small" type="text" danger icon={<TrashIcon />} aria-label={t('common.delete')} onClick={() => setRows(rows.filter((_, i) => i !== idx))} />
        </div>
      ))}
      <Button size="small" type="dashed" icon={<PlusIcon />} onClick={() => setRows([...rows, makeEmpty()])}>
        {labelKey}
      </Button>
    </div>
  );
}

export default function DocsTypesAdmin() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} create | type object
  const [form, setForm] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [fields, setFields] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/docs/admin/types');
      setItems(d.items);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing({});
    setForm({ code: '', name: '', description: '', guide: '', biz_no_label: '', biz_source: '', biz_required: false, validity_days: 365, sort_order: 0, enabled: true });
    setMaterials([]);
    setFields([]);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.nameCn ?? item.name,
      name_tw: item.nameTw ?? '',
      description: item.descriptionCn ?? item.description,
      description_tw: item.descriptionTw ?? '',
      guide: item.guideCn ?? item.guide,
      guide_tw: item.guideTw ?? '',
      biz_no_label: (item.bizNoLabelCn ?? item.bizNoLabel) || '',
      biz_no_label_tw: item.bizNoLabelTw ?? '',
      biz_source: item.bizSource || '',
      biz_required: item.bizRequired,
      validity_days: item.validityDays,
      sort_order: item.sortOrder,
      enabled: item.enabled,
    });
    setMaterials((item.materials || []).map((m) => ({ ...m })));
    setFields((item.formFields || []).map((f) => ({ ...f })));
  };

  const submit = async () => {
    if (!form?.code?.trim() || !form?.name?.trim()) {
      toastError(t('common.required'));
      return;
    }
    setBusy(true);
    try {
      const body = { ...form, materials, formFields: fields };
      if (editing?.id) await api.patch(`/docs/admin/types/${editing.id}`, body);
      else await api.post('/docs/admin/types', body);
      toastSuccess(t('common.save'));
      setEditing(null);
      load();
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  const setF = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const columns = [
    { title: t('docs.admin.types.code'), dataIndex: 'code', width: 130 },
    { title: t('common.name'), dataIndex: 'name', width: 150 },
    { title: t('common.description'), dataIndex: 'description', render: (v) => <span className="docs-cell-clip">{v}</span> },
    { title: t('docs.admin.types.validity'), dataIndex: 'validityDays', width: 90, render: (v) => t('docs.types.validityDays', { days: v }) },
    { title: t('docs.admin.types.fields'), width: 90, align: 'center', render: (_, r) => (r.formFields || []).length },
    { title: t('docs.admin.types.materialsCol'), width: 90, align: 'center', render: (_, r) => (r.materials || []).length },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 90,
      render: (v) => (
        <Tag color={v ? 'app-green' : 'brown'} variant="soft">
          {v ? t('common.enabled') : t('common.disabled')}
        </Tag>
      ),
    },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, row) => (
        <Button size="small" onClick={() => openEdit(row)}>
          {t('common.edit')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('docs.admin.types.title')}</Title>
        </h1>
        <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
          {t('docs.admin.types.create')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={columns} dataSource={items || []} rowKey="id" loading={items === null} emptyText={t('common.empty')} pagination={false} />
      </Card>

      <Modal
        maskClosable={false}
        open={!!editing}
        title={editing?.id ? t('docs.admin.types.editTitle', { name: editing.name }) : t('docs.admin.types.create')}
        width={720}
        typewriter={false}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={busy || !form?.code?.trim() || !form?.name?.trim()} onClick={submit}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {form && (
          <div className="docs-type-editor">
            <div className="docs-editor-grid">
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.admin.types.code')}</span>
                <Input value={form.code} onChange={(e) => setF('code', e.target.value)} disabled={!!editing?.id} placeholder={t('docs.admin.types.codePh')} maxLength={30} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('common.name')}</span>
                <Input value={form.name} onChange={(e) => setF('name', e.target.value)} maxLength={80} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('common.name')} · {t('common.traditional')}</span>
                <Input value={form.name_tw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setF('name_tw', e.target.value)} maxLength={80} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('common.description')}</span>
                <Input value={form.description} onChange={(e) => setF('description', e.target.value)} maxLength={300} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('common.description')} · {t('common.traditional')}</span>
                <Input value={form.description_tw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setF('description_tw', e.target.value)} maxLength={300} />
              </label>
              <label className="docs-field docs-field-wide">
                <span className="docs-field-label">{t('docs.admin.types.guide')}</span>
                <DocsTextarea value={form.guide} onChange={(v) => setF('guide', v)} placeholder={t('docs.admin.types.guidePh')} rows={4} />
              </label>
              <label className="docs-field docs-field-wide">
                <span className="docs-field-label">{t('docs.admin.types.guide')} · {t('common.traditional')}</span>
                <DocsTextarea value={form.guide_tw ?? ''} onChange={(v) => setF('guide_tw', v)} placeholder={t('common.twOptional')} rows={4} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.admin.types.bizLabel')}</span>
                <Input value={form.biz_no_label} onChange={(e) => setF('biz_no_label', e.target.value)} maxLength={40} placeholder={t('docs.admin.types.bizLabelPh')} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.admin.types.bizLabel')} · {t('common.traditional')}</span>
                <Input value={form.biz_no_label_tw ?? ''} onChange={(e) => setF('biz_no_label_tw', e.target.value)} maxLength={40} placeholder={t('common.twOptional')} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.admin.types.bizSource')}</span>
                <Input value={form.biz_source} onChange={(e) => setF('biz_source', e.target.value)} maxLength={30} placeholder={t('docs.admin.types.bizSourcePh')} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.admin.types.bizRequired')}</span>
                <Switch checked={form.biz_required} onChange={(v) => setF('biz_required', v)} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('common.enabled')}</span>
                <Switch checked={form.enabled} onChange={(v) => setF('enabled', v)} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.admin.types.validity')}</span>
                <Input type="number" value={form.validity_days} onChange={(e) => setF('validity_days', Number(e.target.value))} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.admin.types.sort')}</span>
                <Input type="number" value={form.sort_order} onChange={(e) => setF('sort_order', Number(e.target.value))} />
              </label>
            </div>

            <h2>{t('docs.admin.types.materialsCol')}</h2>
            <ListEditor
              labelKey={t('docs.admin.types.addMaterial')}
              rows={materials}
              setRows={setMaterials}
              makeEmpty={() => ({ ...emptyMaterial })}
              columns={(row, set) => (
                <>
                  <Input value={row.key} onChange={(e) => set({ key: e.target.value })} placeholder={t('docs.admin.types.materialKeyPh')} className="docs-editor-key" />
                  <Input value={row.label} onChange={(e) => set({ label: e.target.value })} placeholder={t('docs.admin.types.materialLabel')} />
                  <Input value={row.labelTw ?? ''} onChange={(e) => set({ labelTw: e.target.value })} placeholder={t('common.twOptional')} />
                  <label className="docs-editor-check">
                    <Switch size="small" checked={!!row.required} onChange={(v) => set({ required: v })} />
                    <span>{t('docs.apply.required')}</span>
                  </label>
                  <Input value={row.accept} onChange={(e) => set({ accept: e.target.value })} placeholder={t('docs.admin.types.acceptPh')} className="docs-editor-accept" />
                  <Input type="number" value={row.max_mb} onChange={(e) => set({ max_mb: Number(e.target.value) })} className="docs-editor-num" />
                  <Input type="number" value={row.max_count} onChange={(e) => set({ max_count: Number(e.target.value) })} className="docs-editor-num" />
                </>
              )}
            />

            <h2>{t('docs.admin.types.fields')}</h2>
            <ListEditor
              labelKey={t('docs.admin.types.addField')}
              rows={fields}
              setRows={setFields}
              makeEmpty={() => ({ ...emptyField })}
              columns={(row, set) => (
                <>
                  <Input value={row.key} onChange={(e) => set({ key: e.target.value })} placeholder={t('docs.admin.types.fieldKeyPh')} className="docs-editor-key" />
                  <Input value={row.label} onChange={(e) => set({ label: e.target.value })} placeholder={t('docs.admin.types.fieldLabel')} />
                  <Input value={row.labelTw ?? ''} onChange={(e) => set({ labelTw: e.target.value })} placeholder={t('common.twOptional')} />
                  <label className="docs-editor-check">
                    <Switch size="small" checked={!!row.required} onChange={(v) => set({ required: v })} />
                    <span>{t('docs.apply.required')}</span>
                  </label>
                  <Input value={row.placeholder} onChange={(e) => set({ placeholder: e.target.value })} placeholder={t('docs.admin.types.placeholderPh')} className="docs-editor-accept" />
                  <Input value={row.placeholderTw ?? ''} onChange={(e) => set({ placeholderTw: e.target.value })} placeholder={t('common.twOptional')} className="docs-editor-accept" />
                </>
              )}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
