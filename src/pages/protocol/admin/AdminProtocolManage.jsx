// 署内配置:活动类型与表单规则、前缀配置、署内公告、站内信模板,
// 以及验真/风控/工单报表面板。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Switch,
  Table,
  Tabs,
  Tag,
  Title,
} from 'animal-island-ui';
import { EditIcon, PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import AutoApproveSettings from '../../../components/AutoApproveSettings.jsx';
import { TextArea, fmtDateTime, toastProtocolError } from '../shared.jsx';
import { toastSuccess } from '../shared.jsx';
import AdminProtocolRisk from './AdminProtocolRisk.jsx';

const MATERIAL_KINDS = ['intro', 'letter', 'proof', 'community', 'other'];
const FIELD_OPTIONS = ['nickname', 'contact'];
const LEVELS = ['info', 'policy', 'event'];
const CONFIG_KEYS = [
  'review_hours_hint',
  'supplement_days',
  'verify_limit_per_5min',
  'max_companions',
  'max_active_registrations',
  'linkage_enabled',
  'prefix.event',
  'prefix.registration',
  'prefix.invitation',
  'prefix.pass',
  'prefix.host',
  'prefix.host_cert',
  'prefix.courtesy',
];

const EMPTY_TYPE = {
  code: '',
  name: '',
  description: '',
  guide: '',
  requiredFields: ['nickname', 'contact'],
  materials: [],
  allowCompanions: true,
  maxCompanions: 2,
  defaultCapacity: 100,
  enabled: true,
  sortOrder: 99,
};

export default function AdminProtocolManage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('types');
  const [types, setTypes] = useState(null);
  const [config, setConfig] = useState({});
  const [notices, setNotices] = useState(null);
  const [templates, setTemplates] = useState(null);

  const [typeEdit, setTypeEdit] = useState(null);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [noticeEdit, setNoticeEdit] = useState(null);
  const [noticeForm, setNoticeForm] = useState({ title: '', body: '', level: 'info', enabled: true });
  const [templateEdit, setTemplateEdit] = useState(null);
  const [templateForm, setTemplateForm] = useState({ title: '', body: '', titleTw: '', bodyTw: '', enabled: true });
  const [deleteNotice, setDeleteNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadTypes = useCallback(async () => {
    try {
      const data = await api.get('/protocol/admin/types');
      setTypes(data.items);
    } catch (err) {
      toastProtocolError(t, err);
      setTypes([]);
    }
  }, [t]);

  const loadConfig = useCallback(async () => {
    try {
      const data = await api.get('/protocol/admin/config');
      setConfig(Object.fromEntries(data.items.map((c) => [c.key, c.value])));
    } catch (err) {
      toastProtocolError(t, err);
    }
  }, [t]);

  const loadNotices = useCallback(async () => {
    try {
      const data = await api.get('/protocol/admin/notices');
      setNotices(data.items);
    } catch (err) {
      toastProtocolError(t, err);
      setNotices([]);
    }
  }, [t]);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.get('/protocol/admin/templates');
      setTemplates(data.items);
    } catch (err) {
      toastProtocolError(t, err);
      setTemplates([]);
    }
  }, [t]);

  useEffect(() => { loadTypes(); loadConfig(); loadNotices(); loadTemplates(); }, [loadTypes, loadConfig, loadNotices, loadTemplates]);

  const saveType = async () => {
    setBusy(true);
    try {
      if (typeEdit === 'new') await api.post('/protocol/admin/types', typeForm);
      else await api.patch(`/protocol/admin/types/${typeEdit.id}`, typeForm);
      toastSuccess(t('common.save'));
      setTypeEdit(null);
      await loadTypes();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async (key) => {
    try {
      await api.patch('/protocol/admin/config', { key, value: config[key] });
      toastSuccess(t('common.save'));
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const saveNotice = async () => {
    setBusy(true);
    try {
      if (noticeEdit === 'new') await api.post('/protocol/admin/notices', noticeForm);
      else await api.patch(`/protocol/admin/notices/${noticeEdit.id}`, noticeForm);
      toastSuccess(t('common.save'));
      setNoticeEdit(null);
      await loadNotices();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const removeNotice = async () => {
    if (!deleteNotice) return;
    try {
      await api.del(`/protocol/admin/notices/${deleteNotice.id}`);
      toastSuccess(t('common.deleted'));
      setDeleteNotice(null);
      await loadNotices();
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const saveTemplate = async () => {
    if (!templateEdit) return;
    setBusy(true);
    try {
      await api.patch(`/protocol/admin/templates/${templateEdit.code}`, templateForm);
      toastSuccess(t('common.save'));
      setTemplateEdit(null);
      await loadTemplates();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const typeColumns = [
    { title: t('protocol.field.code'), dataIndex: 'code', width: 120 },
    { title: t('protocol.field.name'), dataIndex: 'name', width: 130 },
    { title: t('protocol.field.description'), dataIndex: 'description' },
    { title: t('protocol.field.maxCompanions'), dataIndex: 'maxCompanions', width: 100 },
    { title: t('common.enabled'), dataIndex: 'enabled', width: 90, render: (v) => <Tag color={v ? 'app-green' : 'brown'} variant="soft">{v ? t('common.enabled') : t('common.disabled')}</Tag> },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, row) => (
        <Button
          type="text"
          size="small"
          icon={<EditIcon />}
          onClick={() => {
            setTypeForm({
              code: row.code,
              name: row.nameCn ?? row.name,
              nameTw: row.nameTw ?? '',
              description: row.descriptionCn ?? row.description,
              descriptionTw: row.descriptionTw ?? '',
              guide: row.guideCn ?? row.guide,
              guideTw: row.guideTw ?? '',
              requiredFields: row.requiredFields,
              materials: row.materials.map((m) => m.kind),
              allowCompanions: row.allowCompanions,
              maxCompanions: row.maxCompanions,
              defaultCapacity: row.defaultCapacity,
              enabled: row.enabled,
              sortOrder: row.sortOrder,
            });
            setTypeEdit(row);
          }}
        >
          {t('protocol.action.edit')}
        </Button>
      ),
    },
  ];

  const noticeColumns = [
    { title: t('protocol.field.title'), dataIndex: 'title', width: 220 },
    { title: t('protocol.field.level'), dataIndex: 'level', width: 90, render: (v) => <Tag variant="soft" size="small" color={v === 'policy' ? 'warm-peach-pink' : v === 'event' ? 'app-pink' : 'app-blue'}>{t(`protocol.level.${v}`)}</Tag> },
    { title: t('common.enabled'), dataIndex: 'enabled', width: 80, render: (v) => (v ? t('common.enabled') : t('common.disabled')) },
    { title: t('protocol.field.createdAt'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      width: 140,
      render: (_, row) => (
        <div className="protocol-row-actions">
          <Button type="text" size="small" onClick={() => { setNoticeForm({ title: row.titleCn ?? row.title, titleTw: row.titleTw ?? '', body: row.bodyCn ?? row.body, bodyTw: row.bodyTw ?? '', level: row.level, enabled: !!row.enabled }); setNoticeEdit(row); }}>
            {t('protocol.action.edit')}
          </Button>
          <Button type="text" size="small" danger onClick={() => setDeleteNotice(row)}>{t('protocol.action.delete')}</Button>
        </div>
      ),
    },
  ];

  const templateColumns = [
    { title: t('protocol.field.code'), dataIndex: 'code', width: 190 },
    { title: t('protocol.field.title'), dataIndex: 'title_template' },
    { title: t('common.enabled'), dataIndex: 'enabled', width: 80, render: (v) => (v ? t('common.enabled') : t('common.disabled')) },
    {
      title: t('common.actions'),
      width: 90,
      render: (_, row) => (
        <Button type="text" size="small" onClick={() => {
          setTemplateForm({
            title: row.title_templateCn ?? row.title_template,
            body: row.body_templateCn ?? row.body_template,
            titleTw: row.title_templateTw ?? '',
            bodyTw: row.body_templateTw ?? '',
            enabled: !!row.enabled,
          });
          setTemplateEdit(row);
        }}>
          {t('protocol.action.edit')}
        </Button>
      ),
    },
  ];

  const typesTab = (
    <div>
      <div className="protocol-filter-bar">
        <Button
          type="primary"
          icon={<PlusIcon />}
          onClick={() => { setTypeForm(EMPTY_TYPE); setTypeEdit('new'); }}
        >
          {t('protocol.admin.addType')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={typeColumns} dataSource={types ?? []} loading={types === null} rowKey="id" pagination={false} emptyText={t('protocol.common.noData')} />
      </Card>
    </div>
  );

  const configTab = (
    <Card>
      <AutoApproveSettings service="protocol" />
      <p className="muted-text">{t('protocol.admin.configHint')}</p>
      <div className="protocol-config-list">
        {CONFIG_KEYS.map((key) => (
          <div key={key} className="protocol-config-row">
            <div className="protocol-config-label">
              <strong>{t(`protocol.admin.config.${key}`, { defaultValue: t('common.unknown') })}</strong>
              <code>{key}</code>
            </div>
            <Input value={config[key] ?? ''} onChange={(e) => setConfig((p) => ({ ...p, [key]: e.target.value }))} />
            <Button type="dashed" size="small" onClick={() => saveConfig(key)}>{t('protocol.action.save')}</Button>
          </div>
        ))}
      </div>
    </Card>
  );

  const noticesTab = (
    <div>
      <div className="protocol-filter-bar">
        <Button type="primary" icon={<PlusIcon />} onClick={() => { setNoticeForm({ title: '', titleTw: '', body: '', bodyTw: '', level: 'info', enabled: true }); setNoticeEdit('new'); }}>
          {t('protocol.admin.addNotice')}
        </Button>
      </div>
      <Card>
        <Table className="table-fit" columns={noticeColumns} dataSource={notices ?? []} loading={notices === null} rowKey="id" pagination={false} emptyText={t('protocol.common.noData')} />
      </Card>
    </div>
  );

  const templatesTab = (
    <Card>
      <p className="muted-text">{t('protocol.admin.templateHint')}</p>
      <Table className="table-fit" columns={templateColumns} dataSource={templates ?? []} loading={templates === null} rowKey="code" pagination={false} emptyText={t('protocol.common.noData')} />
    </Card>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle">{t('protocol.admin.manageTitle')}</Title>
        </h1>
        <p className="muted-text">{t('protocol.admin.manageSubtitle')}</p>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'types', label: t('protocol.admin.eventTypesTab'), children: typesTab },
          { key: 'config', label: t('protocol.admin.configTab'), children: configTab },
          { key: 'notices', label: t('protocol.admin.noticesTab'), children: noticesTab },
          { key: 'templates', label: t('protocol.admin.templatesTab'), children: templatesTab },
          { key: 'risk', label: t('protocol.admin.riskTab'), children: <AdminProtocolRisk /> },
        ]}
      />

      <Modal
        maskClosable={false}
        open={typeEdit !== null}
        title={typeEdit === 'new' ? t('protocol.admin.addType') : t('protocol.admin.editType')}
        onClose={() => setTypeEdit(null)}
        typewriter={false}
        width={620}
        footer={
          <>
            <Button onClick={() => setTypeEdit(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!typeForm.name || !typeForm.code} onClick={saveType}>{t('protocol.action.save')}</Button>
          </>
        }
      >
        <div className="protocol-modal-form">
          <label className="protocol-field">
            <span>{t('protocol.field.code')}</span>
            <Input value={typeForm.code} onChange={(e) => setTypeForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} disabled={typeEdit !== 'new'} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.name')}</span>
            <Input value={typeForm.name} onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.name')} · {t('common.traditional')}</span>
            <Input value={typeForm.nameTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setTypeForm((p) => ({ ...p, nameTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.description')}</span>
            <Input value={typeForm.description} onChange={(e) => setTypeForm((p) => ({ ...p, description: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.description')} · {t('common.traditional')}</span>
            <Input value={typeForm.descriptionTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setTypeForm((p) => ({ ...p, descriptionTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.guide')}</span>
            <TextArea rows={3} value={typeForm.guide} onChange={(e) => setTypeForm((p) => ({ ...p, guide: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.guide')} · {t('common.traditional')}</span>
            <TextArea rows={3} value={typeForm.guideTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setTypeForm((p) => ({ ...p, guideTw: e.target.value }))} />
          </label>
          <div className="protocol-form-grid">
            <label className="protocol-field">
              <span>{t('protocol.field.maxCompanions')}</span>
              <Input type="number" value={String(typeForm.maxCompanions)} onChange={(e) => setTypeForm((p) => ({ ...p, maxCompanions: e.target.value }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.defaultCapacity')}</span>
              <Input type="number" value={String(typeForm.defaultCapacity)} onChange={(e) => setTypeForm((p) => ({ ...p, defaultCapacity: e.target.value }))} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.sortOrder')}</span>
              <Input type="number" value={String(typeForm.sortOrder)} onChange={(e) => setTypeForm((p) => ({ ...p, sortOrder: e.target.value }))} />
            </label>
          </div>
          <h2 className="block-heading">{t('protocol.admin.requiredFields')}</h2>
          <Checkbox
            options={FIELD_OPTIONS.map((f) => ({ label: t(`protocol.field.${f}`), value: f }))}
            value={typeForm.requiredFields}
            onChange={(v) => setTypeForm((p) => ({ ...p, requiredFields: v.map(String) }))}
          />
          <h2 className="block-heading">{t('protocol.admin.materialsConfig')}</h2>
          <Checkbox
            options={MATERIAL_KINDS.map((m) => ({ label: t(`protocol.materialKind.${m}`), value: m }))}
            value={typeForm.materials}
            onChange={(v) => setTypeForm((p) => ({ ...p, materials: v.map(String) }))}
          />
          <div className="protocol-switch-grid">
            <label>
              <span>{t('protocol.admin.allowCompanions')}</span>
              <Switch checked={typeForm.allowCompanions} onChange={(v) => setTypeForm((p) => ({ ...p, allowCompanions: v }))} />
            </label>
            <label>
              <span>{t('common.enabled')}</span>
              <Switch checked={typeForm.enabled} onChange={(v) => setTypeForm((p) => ({ ...p, enabled: v }))} />
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        maskClosable={false}
        open={noticeEdit !== null}
        title={noticeEdit === 'new' ? t('protocol.admin.addNotice') : t('protocol.action.edit')}
        onClose={() => setNoticeEdit(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setNoticeEdit(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!noticeForm.title || !noticeForm.body} onClick={saveNotice}>{t('protocol.action.save')}</Button>
          </>
        }
      >
        <div className="protocol-modal-form">
          <label className="protocol-field">
            <span>{t('protocol.field.title')}</span>
            <Input value={noticeForm.title} onChange={(e) => setNoticeForm((p) => ({ ...p, title: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.title')} · {t('common.traditional')}</span>
            <Input value={noticeForm.titleTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setNoticeForm((p) => ({ ...p, titleTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.body')}</span>
            <TextArea rows={5} value={noticeForm.body} onChange={(e) => setNoticeForm((p) => ({ ...p, body: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.body')} · {t('common.traditional')}</span>
            <TextArea rows={5} value={noticeForm.bodyTw ?? ''} placeholder={t('common.twOptional')} onChange={(e) => setNoticeForm((p) => ({ ...p, bodyTw: e.target.value }))} />
          </label>
          <Checkbox
            options={LEVELS.map((l) => ({ label: t(`protocol.level.${l}`), value: l }))}
            value={[noticeForm.level]}
            onChange={(v) => setNoticeForm((p) => ({ ...p, level: String(v[0] || 'info') }))}
          />
          <label className="protocol-inline-gap">
            <span>{t('common.enabled')}</span>
            <Switch checked={noticeForm.enabled} onChange={(v) => setNoticeForm((p) => ({ ...p, enabled: v }))} />
          </label>
        </div>
      </Modal>

      <Modal
        maskClosable={false}
        open={deleteNotice !== null}
        title={t('common.confirmDeleteTitle')}
        onClose={() => setDeleteNotice(null)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteNotice(null)}>{t('common.cancel')}</Button>
            <Button type="primary" danger onClick={removeNotice}>{t('protocol.action.delete')}</Button>
          </>
        }
      >
        <p>{t('common.deleteTip')}</p>
      </Modal>

      <Modal
        maskClosable={false}
        open={templateEdit !== null}
        title={templateEdit ? t('protocol.admin.templateEditTitle', { code: templateEdit.code }) : ''}
        onClose={() => setTemplateEdit(null)}
        typewriter={false}
        width={620}
        footer={
          <>
            <Button onClick={() => setTemplateEdit(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={saveTemplate}>{t('protocol.action.save')}</Button>
          </>
        }
      >
        <div className="protocol-modal-form">
          <label className="protocol-field">
            <span>{t('protocol.field.titleTemplate')}</span>
            <Input value={templateForm.title} onChange={(e) => setTemplateForm((p) => ({ ...p, title: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.titleTemplate')} · {t('common.traditional')}</span>
            <Input value={templateForm.titleTw} placeholder={t('common.twOptional')} onChange={(e) => setTemplateForm((p) => ({ ...p, titleTw: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.bodyTemplate')}</span>
            <TextArea rows={6} value={templateForm.body} onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))} />
          </label>
          <label className="protocol-field">
            <span>{t('protocol.field.bodyTemplate')} · {t('common.traditional')}</span>
            <TextArea rows={6} value={templateForm.bodyTw} placeholder={t('common.twOptional')} onChange={(e) => setTemplateForm((p) => ({ ...p, bodyTw: e.target.value }))} />
          </label>
          <p className="muted-text">{t('protocol.admin.templateVars', { vars: templateEdit?.variables || '-' })}</p>
          <label className="protocol-inline-gap">
            <span>{t('common.enabled')}</span>
            <Switch checked={templateForm.enabled} onChange={(v) => setTemplateForm((p) => ({ ...p, enabled: v }))} />
          </label>
        </div>
      </Modal>
    </div>
  );
}