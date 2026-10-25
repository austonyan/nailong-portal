// 接待方认证:登记、材料上传、状态追踪、认证证书与权限展示。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Drawer,
  Input,
  Modal,
  Select,
  Tag,
  Title,
  Upload,
} from 'animal-island-ui';
import { BadgeCheckIcon, EyeIcon, PlusIcon, SendIcon, TrashIcon, UserPlusIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import {
  StatusTag,
  TextArea,
  fmtDate,
  fmtDateTime,
  openProtocolMaterial,
  toastProtocolError,
  uploadProtocolMaterial,
} from './shared.jsx';
import { toastSuccess } from './shared.jsx';

const HOST_TYPES = ['organizer', 'community', 'diplomatic', 'resident_group'];
const EMPTY = { type: 'organizer', name: '', contactNickname: '', contact: '', intro: '' };

export default function ProtocolHosts() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [materials, setMaterials] = useState([]);
  const [kind, setKind] = useState('intro');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/protocol/hosts');
      setItems(data.items);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY);
    setMaterials([]);
  };

  const openEdit = async (host) => {
    try {
      const data = await api.get(`/protocol/hosts/${host.id}`);
      const h = data.host;
      setEditing(h);
      setForm({
        type: h.type,
        name: h.name || '',
        contactNickname: h.contactNickname || '',
        contact: h.contact || '',
        intro: h.intro || '',
      });
      setMaterials(h.materials || []);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const refresh = async (hostId) => {
    const data = await api.get(`/protocol/hosts/${hostId}`);
    setEditing(data.host);
    setMaterials(data.host.materials || []);
    await load();
    return data.host;
  };

  const saveDraft = async ({ silent = false } = {}) => {
    setBusy(true);
    try {
      const body = { ...form };
      const data =
        editing === 'new'
          ? await api.post('/protocol/hosts', body)
          : await api.patch(`/protocol/hosts/${editing.id}`, body);
      const host = data.host;
      setEditing(host);
      setMaterials(host.materials || []);
      await load();
      if (!silent) toastSuccess(t('protocol.hosts.draftSaved'));
      return host;
    } catch (err) {
      toastProtocolError(t, err);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      let host = editing;
      if (host === 'new') {
        host = await saveDraft({ silent: true });
        if (!host) return;
      } else {
        const data = await api.patch(`/protocol/hosts/${host.id}`, { ...form });
        host = data.host;
      }
      await api.post(`/protocol/hosts/${host.id}/submit`);
      toastSuccess(t('protocol.hosts.submitted'));
      setEditing(null);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const removeMaterial = async (materialId) => {
    try {
      await api.del(`/protocol/materials/${materialId}`);
      await refresh(editing.id);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const removeDraft = async () => {
    setDeleteOpen(false);
    if (editing === 'new') {
      setEditing(null);
      return;
    }
    try {
      await api.del(`/protocol/hosts/${editing.id}`);
      setEditing(null);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const editable = editing === 'new' || ['draft', 'supplement_required'].includes(editing?.status);

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.hosts.title')}</Title>
        <p className="muted-text">{t('protocol.hosts.subtitle')}</p>
      </div>

      <Card color="app-blue" className="protocol-info-card">
        <UserPlusIcon size={20} />
        <p>{t('protocol.hosts.intro')}</p>
        <Button type="primary" size="small" icon={<PlusIcon />} onClick={openNew}>
          {t('protocol.hosts.applyTitle')}
        </Button>
      </Card>

      <div className="protocol-host-grid">
        {(items ?? []).map((host) => (
          <Card key={host.id} className="protocol-host-card" hoverable onClick={() => openEdit(host)}>
            <div className="protocol-host-head">
              <Tag color="app-teal" variant="solid">{t(`protocol.hostType.${host.type}`)}</Tag>
              <StatusTag status={host.status} />
            </div>
            <h3>{host.name || t('protocol.hosts.unnamed')}</h3>
            <p className="protocol-host-no">{host.hostNo}</p>
            <div className="protocol-host-meta">
              <span>{t('protocol.field.contactNickname')}: {host.contactNickname || '-'}</span>
              <span>{t('protocol.hosts.submitted')}: {fmtDateTime(host.submittedAt)}</span>
            </div>
            {host.certNo && (
              <div className="protocol-cert-inline">
                <BadgeCheckIcon size={18} />
                <span>{t('protocol.field.certNo')}: {host.certNo}</span>
              </div>
            )}
            {host.supplementNote && (
              <p className="protocol-status-note">
                {t('protocol.hosts.supplementTip', { note: host.supplementNote, date: fmtDate(host.supplementDeadline) })}
              </p>
            )}
          </Card>
        ))}
        {items && items.length === 0 && (
          <Card type="dashed" className="protocol-empty-card">
            <BadgeCheckIcon size={28} />
            <p className="muted-text">{t('protocol.hosts.empty')}</p>
            <Button type="dashed" onClick={openNew}>{t('protocol.hosts.applyTitle')}</Button>
          </Card>
        )}
      </div>

      <Card type="dashed" className="protocol-tip-card">
        <strong>{t('protocol.hosts.rulesTitle')}</strong>
        <p>{t('protocol.hosts.rules')}</p>
      </Card>

      <Drawer
        open={editing !== null}
        title={editing === 'new' ? t('protocol.hosts.applyTitle') : editing?.hostNo}
        width={620}
        onClose={() => setEditing(null)}
        footer={
          editing && editing !== 'new' ? (
            <div className="protocol-drawer-footer">
              {editable && (
                <Button danger type="text" icon={<TrashIcon />} onClick={() => setDeleteOpen(true)}>
                  {t('protocol.action.delete')}
                </Button>
              )}
              {editable && (
                <Button type="primary" loading={busy} icon={<SendIcon />} onClick={submit}>
                  {t('protocol.action.submit')}
                </Button>
              )}
            </div>
          ) : null
        }
      >
        {editing && (
          <div className="protocol-detail-body">
            {editing !== 'new' && (
              <div className="protocol-detail-status">
                <StatusTag status={editing.status} />
                {editing.certNo && <Tag color="app-green" variant="soft">{editing.certNo}</Tag>}
                {editing.canPublish && <Tag color="app-teal" variant="soft">{t('protocol.hosts.canPublish')}</Tag>}
                {editing.canInvite && <Tag color="app-blue" variant="soft">{t('protocol.hosts.canInvite')}</Tag>}
              </div>
            )}
            <label className="protocol-field">
              <span>{t('protocol.field.hostType')}</span>
              <Select
                value={form.type}
                onChange={(v) => setForm((p) => ({ ...p, type: v }))}
                options={HOST_TYPES.map((code) => ({ key: code, label: t(`protocol.hostType.${code}`) }))}
                disabled={!editable}
              />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.name')} *</span>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder={t('protocol.hosts.namePlaceholder')} disabled={!editable} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.contactNickname')} *</span>
              <Input value={form.contactNickname} onChange={(e) => setForm((p) => ({ ...p, contactNickname: e.target.value }))} placeholder={t('protocol.hosts.contactNicknamePlaceholder')} disabled={!editable} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.contact')} *</span>
              <Input value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} placeholder={t('protocol.hosts.contactPlaceholder')} disabled={!editable} />
            </label>
            <label className="protocol-field">
              <span>{t('protocol.field.intro')}</span>
              <TextArea rows={4} value={form.intro} onChange={(e) => setForm((p) => ({ ...p, intro: e.target.value }))} placeholder={t('protocol.hosts.introPlaceholder')} disabled={!editable} />
            </label>

            {editable && editing === 'new' && <p className="protocol-status-note">{t('protocol.hosts.saveFirst')}</p>}
            {editable && editing !== 'new' && (
              <div className="protocol-upload-row">
                <Select
                  value={kind}
                  onChange={setKind}
                  options={['intro', 'letter', 'proof', 'community', 'other'].map((code) => ({ key: code, label: t(`protocol.materialKind.${code}`) }))}
                />
                <Upload
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  maxCount={1}
                  showUploadList={false}
                  customRequest={({ file, onSuccess, onError }) => {
                    uploadProtocolMaterial({ ownerType: 'host', ownerId: editing.id, kind, file })
                      .then(async () => {
                        onSuccess();
                        await refresh(editing.id);
                        toastSuccess(t('protocol.apply.uploadDone'));
                      })
                      .catch((err) => {
                        onError(err);
                        toastProtocolError(t, err);
                      });
                  }}
                >
                  <Button type="dashed" icon={<PlusIcon />}>{t('protocol.apply.uploadMaterial')}</Button>
                </Upload>
              </div>
            )}
            <ul className="protocol-material-list">
              {materials.map((m) => (
                <li key={m.id}>
                  <Tag size="small" variant="soft" color="app-blue">
                    {t(`protocol.materialKind.${m.kind}`, { defaultValue: m.kind })}
                  </Tag>
                  <span className="protocol-material-name">{m.filename}</span>
                  <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openProtocolMaterial(m.id)}>
                    {t('protocol.action.preview')}
                  </Button>
                  {editable && (
                    <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => removeMaterial(m.id)}>
                      {t('protocol.action.delete')}
                    </Button>
                  )}
                </li>
              ))}
              {materials.length === 0 && <li className="muted-text">{t('protocol.hosts.materialTip')}</li>}
            </ul>

            {editing !== 'new' && editing.rejectComment && (
              <Card color="app-red">
                <strong>{t('protocol.field.rejectReason')}</strong>
                <p>{editing.rejectComment}</p>
              </Card>
            )}

            {editable && editing === 'new' && (
              <Button type="primary" block loading={busy} onClick={() => saveDraft()}>
                {t('protocol.action.saveDraft')}
              </Button>
            )}
            {editable && editing !== 'new' && (
              <Button block loading={busy} onClick={() => saveDraft()}>
                {t('protocol.action.saveDraft')}
              </Button>
            )}

            {editing !== 'new' && editing.certNo && (
              <div className="protocol-host-cert">
                <BadgeCheckIcon size={34} />
                <h3>{t('protocol.hosts.certTitle')}</h3>
                <p>{t('protocol.hosts.certBody', { name: editing.name })}</p>
                <div className="protocol-cert-no">{editing.certNo}</div>
                <small>{t('protocol.hosts.certLink')}</small>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={deleteOpen}
        title={t('common.confirmDeleteTitle')}
        onClose={() => setDeleteOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" danger onClick={removeDraft}>{t('protocol.action.delete')}</Button>
          </>
        }
      >
        <p>{t('protocol.hosts.deleteConfirm')}</p>
      </Modal>
    </div>
  );
}