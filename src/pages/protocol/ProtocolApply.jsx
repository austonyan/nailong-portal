// 活动报名:填写信息、身份类型、随行人员、材料上传、保存草稿与提交确认。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Checkbox,
  Input,
  Modal,
  Radio,
  Select,
  Tag,
  Title,
  Upload,
} from 'animal-island-ui';
import { AlertTriangleIcon, EyeIcon, PlusIcon, SendIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import {
  TextArea,
  fmtDateTime,
  openProtocolMaterial,
  toastProtocolError,
  uploadProtocolMaterial,
} from './shared.jsx';
import { toastSuccess, toastError } from './shared.jsx';

const EMPTY_FORM = {
  nickname: '',
  contact: '',
  identityType: 'ordinary',
  identityNo: '',
  invitationNo: '',
  note: '',
  companions: [],
};

function formFromRegistration(reg) {
  return {
    nickname: reg.nickname || '',
    contact: reg.contact || '',
    identityType: reg.identityType || 'ordinary',
    identityNo: reg.identityNo || '',
    invitationNo: reg.invitationNo || '',
    note: reg.note || '',
    companions: Array.isArray(reg.companions) ? reg.companions : [],
  };
}

export default function ProtocolApply() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { no, id } = useParams();
  const [event, setEvent] = useState(null);
  const [type, setType] = useState(null);
  const [materialsRequired, setMaterialsRequired] = useState([]);
  const [draft, setDraft] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [kind, setKind] = useState('other');
  const [declared, setDeclared] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const maxCompanions = type?.maxCompanions ?? 3;
  const partySize = 1 + form.companions.length;

  const applyEventData = (data) => {
    setEvent(data.event ?? data.registration?.event ?? null);
    setType(data.type ?? null);
    setMaterialsRequired(data.materialsRequired ?? []);
    if (data.materials) setMaterials(data.materials);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (id) {
          const data = await api.get(`/protocol/registrations/${id}`);
          const reg = data.registration;
          const full = await api.get(`/protocol/events/${reg.event.eventNo}`);
          if (cancelled) return;
          setDraft(reg);
          setForm(formFromRegistration(reg));
          applyEventData({ ...full, materials: reg.materials });
        } else {
          const data = await api.get(`/protocol/events/${encodeURIComponent(no)}`);
          if (cancelled) return;
          if (data.myRegistration) {
            navigate(`/protocol/registrations/${data.myRegistration.id}/edit`, { replace: true });
            return;
          }
          applyEventData(data);
        }
      } catch (err) {
        toastProtocolError(t, err);
        if (!cancelled) setLoadError(err.message || 'error');
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, no, t]);

  const kindOptions = useMemo(() => {
    const seen = new Set(['other']);
    const list = [{ key: 'other', label: t('protocol.materialKind.other') }];
    for (const m of materialsRequired) {
      if (seen.has(m.kind)) continue;
      seen.add(m.kind);
      list.push({ key: m.kind, label: t(`protocol.materialKind.${m.kind}`, { defaultValue: m.kind }) });
    }
    return list;
  }, [materialsRequired, t]);

  const refreshMaterials = useCallback(async (regId) => {
    const data = await api.get(`/protocol/registrations/${regId}`);
    setMaterials(data.registration.materials);
    setDraft(data.registration);
  }, []);

  const payload = () => ({
    ...form,
    partySize,
    companions: form.companions.map((c) => ({ nickname: c.nickname, relation: c.relation, contact: c.contact })),
  });

  const saveDraft = async ({ silent = false } = {}) => {
    setBusy(true);
    try {
      const body = payload();
      const data = draft
        ? await api.patch(`/protocol/registrations/${draft.id}`, body)
        : await api.post('/protocol/registrations', { eventId: event.id, ...body });
      setDraft(data.registration);
      setMaterials(data.registration.materials);
      if (!silent) toastSuccess(t('protocol.apply.draftSaved'));
      return data.registration;
    } catch (err) {
      toastProtocolError(t, err);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = async () => {
    if (!form.nickname.trim() || !form.contact.trim()) {
      toastError(t('protocol.apply.requiredHint'));
      return;
    }
    setDeclared(false);
    setConfirmOpen(true);
  };

  const submit = async () => {
    if (!declared) {
      toastError(t('protocol.apply.declarationRequired'));
      return;
    }
    setBusy(true);
    try {
      let reg = draft;
      if (!reg) {
        reg = await saveDraft({ silent: true });
        if (!reg) return;
      } else {
        const data = await api.patch(`/protocol/registrations/${reg.id}`, payload());
        reg = data.registration;
      }
      const data = await api.post(`/protocol/registrations/${reg.id}/submit`, { entertainmentAgreed: true });
      toastSuccess(t('protocol.apply.submitSuccess', { no: data.registration.regNo }));
      setConfirmOpen(false);
      navigate(`/protocol/registrations/${data.registration.id}`, { replace: true });
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const addCompanion = () => {
    if (form.companions.length >= maxCompanions) return;
    update({ companions: [...form.companions, { nickname: '', relation: '', contact: '' }] });
  };

  const updateCompanion = (index, patch) => {
    update({ companions: form.companions.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  };

  const removeCompanion = (index) => {
    update({ companions: form.companions.filter((_, i) => i !== index) });
  };

  const removeMaterial = async (materialId) => {
    try {
      await api.del(`/protocol/materials/${materialId}`);
      await refreshMaterials(draft.id);
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  if (!event) {
    return (
      <Card type="dashed">
        <p className="muted-text">{loadError || t('common.loading')}</p>
        <Button onClick={() => navigate('/protocol/events')}>{t('protocol.action.back')}</Button>
      </Card>
    );
  }

  const readOnly = draft && draft.status !== 'draft';
  const identityOptions = [
    { label: t('protocol.identity.ordinary'), value: 'ordinary', disabled: event.diplomaticOnly || event.residentOnly },
    { label: t('protocol.identity.resident'), value: 'resident', disabled: event.diplomaticOnly },
    { label: t('protocol.identity.diplomatic'), value: 'diplomatic', disabled: event.residentOnly },
    { label: t('protocol.identity.foreign'), value: 'foreign', disabled: event.diplomaticOnly || event.residentOnly },
  ];

  return (
    <div className="protocol-apply-page">
      <div className="page-header">
        <Title size="middle">{draft ? t('protocol.apply.editTitle') : t('protocol.apply.title')}</Title>
        <p className="muted-text">
          {event.title} · {fmtDateTime(event.startsAt)} · {event.venueName}
        </p>
      </div>

      {readOnly && (
        <Card color="app-yellow">
          <p>{t('protocol.apply.editLocked', { status: t(`protocol.status.${draft.status}`) })}</p>
        </Card>
      )}

      <div className="protocol-apply-layout">
        <div className="protocol-apply-main">
          <Card className="protocol-form-card">
            <h4>{t('protocol.apply.infoSection')}</h4>
            <div className="protocol-form-grid">
              <label className="protocol-field">
                <span>{t('protocol.field.nickname')} *</span>
                <Input value={form.nickname} onChange={(e) => update({ nickname: e.target.value })} placeholder={t('protocol.apply.nicknamePlaceholder')} disabled={readOnly} />
              </label>
              <label className="protocol-field">
                <span>{t('protocol.field.contact')} *</span>
                <Input value={form.contact} onChange={(e) => update({ contact: e.target.value })} placeholder={t('protocol.apply.contactPlaceholder')} disabled={readOnly} />
              </label>
              <label className="protocol-field">
                <span>{t('protocol.field.partySize')}</span>
                <Input value={String(partySize)} disabled />
                <small className="muted-text">{t('protocol.apply.partySizeHint', { max: maxCompanions + 1 })}</small>
              </label>
              <label className="protocol-field">
                <span>{t('protocol.field.invitationNo')}</span>
                <Input value={form.invitationNo} onChange={(e) => update({ invitationNo: e.target.value.toUpperCase() })} placeholder={t('protocol.apply.invitationNoPlaceholder')} disabled={readOnly} />
              </label>
            </div>

            <h4>{t('protocol.apply.identitySection')}</h4>
            <Radio
              value={form.identityType}
              onChange={(v) => update({ identityType: String(v) })}
              options={identityOptions}
              direction="vertical"
              disabled={readOnly}
            />
            {(form.identityType === 'resident' || form.identityType === 'diplomatic') && (
              <label className="protocol-field protocol-field-spaced">
                <span>{t('protocol.field.identityNo')}</span>
                <Input
                  value={form.identityNo}
                  onChange={(e) => update({ identityNo: e.target.value.toUpperCase() })}
                  placeholder={t(`protocol.apply.identityNoPlaceholder_${form.identityType}`)}
                  disabled={readOnly}
                />
                <small className="muted-text">{t('protocol.apply.identityHint')}</small>
              </label>
            )}

            <h4>{t('protocol.apply.companionsSection')}</h4>
            <p className="muted-text">{t('protocol.apply.companionsHint', { max: maxCompanions })}</p>
            {form.companions.map((c, i) => (
              <div key={i} className="protocol-companion-row">
                <Input value={c.nickname} onChange={(e) => updateCompanion(i, { nickname: e.target.value })} placeholder={t('protocol.field.companionName')} disabled={readOnly} />
                <Input value={c.relation} onChange={(e) => updateCompanion(i, { relation: e.target.value })} placeholder={t('protocol.field.relation')} disabled={readOnly} />
                <Input value={c.contact} onChange={(e) => updateCompanion(i, { contact: e.target.value })} placeholder={t('protocol.field.contact')} disabled={readOnly} />
                {!readOnly && (
                  <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => removeCompanion(i)}>
                    {t('protocol.action.delete')}
                  </Button>
                )}
              </div>
            ))}
            {!readOnly && form.companions.length < maxCompanions && (
              <Button type="dashed" size="small" icon={<PlusIcon />} onClick={addCompanion}>
                {t('protocol.apply.addCompanion')}
              </Button>
            )}

            <h4>{t('protocol.apply.noteSection')}</h4>
            <TextArea
              rows={3}
              value={form.note}
              onChange={(e) => update({ note: e.target.value })}
              placeholder={t('protocol.apply.notePlaceholder')}
              disabled={readOnly}
            />
          </Card>

          <Card className="protocol-form-card">
            <h4>{t('protocol.apply.materialsSection')}</h4>
            <p className="muted-text">{t('protocol.apply.materialsHint')}</p>
            {materialsRequired.length > 0 && (
              <ul className="protocol-material-req">
                {materialsRequired.map((m) => (
                  <li key={`${m.kind}-${m.required ? 1 : 0}`}>
                    <span>{t(`protocol.materialKind.${m.kind}`, { defaultValue: m.kind })}</span>
                    <Tag color={m.required ? 'app-orange' : 'default'} size="small" variant="soft">
                      {m.required ? t('protocol.common.required') : t('protocol.common.optional')}
                    </Tag>
                  </li>
                ))}
              </ul>
            )}
            {!draft && <p className="protocol-status-note">{t('protocol.apply.saveFirstForUpload')}</p>}
            {draft && !readOnly && (
              <div className="protocol-upload-row">
                <Select value={kind} onChange={setKind} options={kindOptions} placeholder={t('protocol.apply.materialKind')} />
                <Upload
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  maxCount={1}
                  showUploadList={false}
                  customRequest={({ file, onSuccess, onError }) => {
                    uploadProtocolMaterial({ ownerType: 'registration', ownerId: draft.id, kind, file })
                      .then(async () => {
                        onSuccess();
                        await refreshMaterials(draft.id);
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
                  {!readOnly && (
                    <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => removeMaterial(m.id)}>
                      {t('protocol.action.delete')}
                    </Button>
                  )}
                </li>
              ))}
              {materials.length === 0 && <li className="muted-text">{t('protocol.apply.noMaterials')}</li>}
            </ul>
          </Card>
        </div>

        <aside className="protocol-apply-side">
          <Card>
            <h4>{t('protocol.apply.summary')}</h4>
            <div className="protocol-summary-row">
              <span>{t('protocol.field.partySize')}</span>
              <strong>{partySize}</strong>
            </div>
            <div className="protocol-summary-row">
              <span>{t('protocol.field.identityType')}</span>
              <strong>{t(`protocol.identity.${form.identityType}`)}</strong>
            </div>
            <div className="protocol-summary-row">
              <span>{t('protocol.field.invitationNo')}</span>
              <strong>{form.invitationNo || '-'}</strong>
            </div>
            <div className="protocol-summary-row">
              <span>{t('protocol.field.materials')}</span>
              <strong>{materials.length}</strong>
            </div>
            <p className="muted-text">{t('protocol.apply.summaryTip')}</p>
            {!readOnly && (
              <div className="protocol-apply-actions">
                <Button block loading={busy} onClick={() => saveDraft()}>
                  {t('protocol.action.saveDraft')}
                </Button>
                <Button type="primary" block icon={<SendIcon />} loading={busy} onClick={openConfirm}>
                  {t('protocol.action.nextConfirm')}
                </Button>
              </div>
            )}
          </Card>
          <Card color="app-yellow">
            <div className="protocol-scam-inner">
              <AlertTriangleIcon size={20} />
              <div>
                <strong>{t('protocol.entertainmentNotice')}</strong>
                <p>{t('protocol.apply.declarationText')}</p>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        open={confirmOpen}
        title={t('protocol.apply.confirmTitle')}
        onClose={() => setConfirmOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>{t('protocol.action.back')}</Button>
            <Button type="primary" loading={busy} disabled={!declared} onClick={submit}>
              {t('protocol.action.confirmSubmit')}
            </Button>
          </>
        }
      >
        <div className="protocol-confirm-body">
          <div className="protocol-summary-row"><span>{t('protocol.field.nickname')}</span><strong>{form.nickname}</strong></div>
          <div className="protocol-summary-row"><span>{t('protocol.field.contact')}</span><strong>{form.contact}</strong></div>
          <div className="protocol-summary-row"><span>{t('protocol.field.identityType')}</span><strong>{t(`protocol.identity.${form.identityType}`)}</strong></div>
          <div className="protocol-summary-row"><span>{t('protocol.field.partySize')}</span><strong>{partySize}</strong></div>
          <div className="protocol-summary-row"><span>{t('protocol.field.companions')}</span><strong>{form.companions.map((c) => c.nickname).filter(Boolean).join('、') || '-'}</strong></div>
          <div className="protocol-summary-row"><span>{t('protocol.field.materials')}</span><strong>{materials.length}</strong></div>
          {form.note && <p className="protocol-preline">{form.note}</p>}
          <Checkbox
            options={[{ label: t('protocol.apply.declarationCheck'), value: 'agree' }]}
            value={declared ? ['agree'] : []}
            onChange={(v) => setDeclared(v.includes('agree'))}
          />
          <p className="muted-text">{t('protocol.apply.declarationText')}</p>
        </div>
      </Modal>
    </div>
  );
}