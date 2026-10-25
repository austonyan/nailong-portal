import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Checkbox, Divider, Input, Modal, Notification, Radio, Tag, Title, Upload } from 'animal-island-ui';
import { PaperclipIcon, SaveIcon, SendIcon } from 'naive-icons';
import { api, requestForm } from '../../api/client.js';
import { downloadMaterial, formatBytes, PURPOSE_KEYS } from '../../api/docs.js';

const emptyForm = {
  nickname: '',
  contact: '',
  bizNo: '',
  purpose: 'display',
  formData: {},
  agreed: false,
};

export default function DocsApply() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [types, setTypes] = useState(null);
  const [typeCode, setTypeCode] = useState(searchParams.get('type') || '');
  const [form, setForm] = useState(emptyForm);
  const [appId, setAppId] = useState(null);
  const [appNo, setAppNo] = useState('');
  const [materials, setMaterials] = useState([]); // server-known materials
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/docs/types')
      .then((d) => {
        if (!cancelled) setTypes(d.items);
      })
      .catch((err) => {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message || t('api.INTERNAL_ERROR') }));
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const type = useMemo(() => types?.find((tp) => tp.code === typeCode) || null, [types, typeCode]);

  // 载入草稿
  useEffect(() => {
    const draftId = searchParams.get('draft');
    if (!draftId) return;
    let cancelled = false;
    api
      .get(`/docs/applications/${draftId}`)
      .then((d) => {
        if (cancelled) return;
        const item = d.item;
        if (item.status !== 'draft') {
          navigate(`/docs/applications/${item.id}`, { replace: true });
          return;
        }
        setTypeCode(item.typeCode);
        setAppId(item.id);
        setAppNo(item.appNo);
        setMaterials(item.materials || []);
        setForm({
          nickname: item.nickname || '',
          contact: item.contact || '',
          bizNo: item.bizNo || '',
          purpose: item.purpose || 'display',
          formData: item.formData || {},
          agreed: !!item.entertainmentAgreed,
        });
      })
      .catch((err) => Notification.error(t(`api.${err.code}`, { defaultValue: err.message })));
    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate, t]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setFormField = (key, value) => setForm((f) => ({ ...f, formData: { ...f.formData, [key]: value } }));

  const payload = useCallback(
    () => ({
      typeCode,
      nickname: form.nickname,
      contact: form.contact,
      bizNo: form.bizNo,
      purpose: form.purpose,
      formData: form.formData,
      agreed: form.agreed,
    }),
    [typeCode, form]
  );

  const materialsOf = useCallback((kind) => materials.filter((m) => m.kind === kind), [materials]);

  const saveDraft = useCallback(
    async ({ silent = false } = {}) => {
      if (!type) return null;
      setSaving(true);
      try {
        if (appId) {
          await api.patch(`/docs/applications/${appId}`, payload());
          if (!silent) Notification.success(t('docs.apply.draftSaved'));
          return appId;
        }
        const d = await api.post('/docs/applications', payload());
        setAppId(d.item.id);
        setAppNo(d.item.appNo);
        setMaterials(d.item.materials || []);
        if (!silent) Notification.success(t('docs.apply.draftSaved'));
        return d.item.id;
      } catch (err) {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [appId, payload, type, t]
  );

  const uploadConf = async (conf, file) => {
    let id = appId;
    if (!id) {
      id = await saveDraft({ silent: true });
      if (!id) return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', conf.key);
    try {
      const d = await requestForm(`/docs/applications/${id}/materials`, fd);
      setMaterials((list) => [...list, d.item]);
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  const removeMaterial = async (m) => {
    try {
      await api.del(`/docs/materials/${m.id}`);
      setMaterials((list) => list.filter((x) => x.id !== m.id));
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  const validateForSubmit = () => {
    if (!type) return t('docs.apply.needType');
    if (!form.nickname.trim()) return t('docs.apply.nicknameRequired');
    if (type.bizRequired && !form.bizNo.trim()) return t('docs.apply.bizRequired', { label: type.bizNoLabel });
    for (const f of type.formFields || []) {
      if (f.required && !String(form.formData[f.key] || '').trim()) return t('docs.apply.fieldRequired', { label: f.label });
    }
    for (const m of type.materials || []) {
      if (m.required && materialsOf(m.key).length === 0) return t('docs.apply.materialRequired', { label: m.label });
    }
    if (!form.agreed) return t('docs.apply.agreeRequired');
    return null;
  };

  const submit = async () => {
    const problem = validateForSubmit();
    if (problem) {
      Notification.warning(problem);
      setConfirming(false);
      return;
    }
    setBusy(true);
    try {
      let id = appId;
      if (id) await api.patch(`/docs/applications/${id}`, payload());
      else {
        const d = await api.post('/docs/applications', payload());
        id = d.item.id;
      }
      const d = await api.post(`/docs/applications/${id}/submit`, { agreed: true });
      Notification.success(t('docs.apply.submitted', { no: d.item.appNo }));
      setConfirming(false);
      navigate(`/docs/applications/${d.item.id}`);
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const pickType = (code) => {
    if (appId) {
      Notification.warning(t('docs.apply.typeLocked'));
      return;
    }
    setTypeCode(code);
    setForm((f) => ({ ...emptyForm, nickname: f.nickname, contact: f.contact }));
  };

  if (types === null) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div className="docs-apply">
      <Title size="middle" color="app-teal">
        {t('docs.apply.title')}
      </Title>

      <Card className="docs-block">
        <h3 className="docs-block-title">{t('docs.apply.step1')}</h3>
        <div className="docs-type-picker">
          {types.map((tp) => (
            <button
              key={tp.code}
              type="button"
              className={tp.code === typeCode ? 'docs-type-option active' : 'docs-type-option'}
              onClick={() => pickType(tp.code)}
            >
              <strong>{tp.name}</strong>
              <span className="muted-text">{tp.code}</span>
            </button>
          ))}
        </div>
      </Card>

      {type && (
        <>
          <Card className="docs-block">
            <h3 className="docs-block-title">{t('docs.apply.step2')}</h3>
            <div className="docs-form-grid">
              <label className="docs-field">
                <span className="docs-field-label">
                  {t('docs.apply.nickname')} <em>*</em>
                </span>
                <Input value={form.nickname} onChange={(e) => setField('nickname', e.target.value)} placeholder={t('docs.apply.nicknamePh')} allowClear maxLength={60} />
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.apply.contact')}</span>
                <Input value={form.contact} onChange={(e) => setField('contact', e.target.value)} placeholder={t('docs.apply.contactPh')} allowClear maxLength={120} />
              </label>
              {type.bizNoLabel && (
                <label className="docs-field">
                  <span className="docs-field-label">
                    {type.bizNoLabel} {type.bizRequired && <em>*</em>}
                  </span>
                  <Input value={form.bizNo} onChange={(e) => setField('bizNo', e.target.value)} placeholder={t('docs.apply.bizPh')} allowClear maxLength={64} />
                  <span className="muted-text docs-field-hint">{t('docs.apply.bizHint', { label: type.bizNoLabel })}</span>
                </label>
              )}
              {(type.formFields || []).map((f) => (
                <label className="docs-field" key={f.key}>
                  <span className="docs-field-label">
                    {f.label} {f.required ? <em>*</em> : <span className="muted-text">({t('common.optional')})</span>}
                  </span>
                  <Input
                    value={form.formData[f.key] || ''}
                    onChange={(e) => setFormField(f.key, e.target.value)}
                    placeholder={f.placeholder || ''}
                    maxLength={Number(f.max) || 120}
                    allowClear
                  />
                </label>
              ))}
              <div className="docs-field">
                <span className="docs-field-label">{t('docs.apply.purpose')}</span>
                <Radio
                  value={form.purpose}
                  onChange={(v) => setField('purpose', v)}
                  options={PURPOSE_KEYS.map((k) => ({ label: t(`docs.purpose.${k}`), value: k }))}
                />
              </div>
            </div>
          </Card>

          <Card className="docs-block">
            <h3 className="docs-block-title">{t('docs.apply.step3')}</h3>
            {(type.materials || []).map((m) => (
              <div className="docs-upload-group" key={m.key}>
                <div className="docs-upload-head">
                  <strong>{m.label}</strong>
                  {m.required ? (
                    <Tag size="small" color="app-red" variant="soft">
                      {t('docs.apply.required')}
                    </Tag>
                  ) : (
                    <Tag size="small" variant="soft">
                      {t('common.optional')}
                    </Tag>
                  )}
                  <span className="muted-text">{t('docs.types.materialRule', { count: m.max_count, mb: m.max_mb })}</span>
                </div>
                <Upload
                  accept={m.accept}
                  maxCount={m.max_count}
                  showUploadList={false}
                  customRequest={({ file }) => uploadConf(m, file)}
                  fileList={materialsOf(m.key).map((mat) => ({
                    uid: String(mat.id),
                    name: mat.filename,
                    size: mat.size,
                    status: 'done',
                  }))}
                  beforeUpload={(file) => {
                    const okType = String(m.accept)
                      .split(',')
                      .some((rule) => {
                        const r = rule.trim();
                        if (r.endsWith('/*')) return file.type.startsWith(r.slice(0, -1));
                        return file.type === r;
                      });
                    const okSize = file.size <= (Number(m.max_mb) || 10) * 1024 * 1024;
                    if (!okType) Notification.error(t('docs.apply.fileTypeBad', { accept: m.accept }));
                    if (!okSize) Notification.error(t('docs.apply.fileTooLarge', { mb: m.max_mb }));
                    return okType && okSize;
                  }}
                >
                  <Button type="dashed" icon={<PaperclipIcon />}>
                    {t('docs.apply.upload')}
                  </Button>
                </Upload>
                <ul className="docs-mat-list">
                  {materialsOf(m.key).map((mat) => (
                    <li key={mat.id}>
                      <PaperclipIcon size={14} />
                      <button type="button" className="docs-mat-name" onClick={() => downloadMaterial(mat.id, mat.filename)}>
                        {mat.filename}
                      </button>
                      <span className="muted-text">{formatBytes(mat.size)}</span>
                      {mat.origin === 'supplement' && (
                        <Tag size="small" color="app-orange" variant="soft">
                          {t('docs.apply.supplementOrigin')}
                        </Tag>
                      )}
                      <Button type="text" size="small" onClick={() => removeMaterial(mat)}>
                        {t('common.delete')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>

          <Card className="docs-block">
            <h3 className="docs-block-title">{t('docs.apply.step4')}</h3>
            <Checkbox
              value={form.agreed ? ['agreed'] : []}
              onChange={(vals) => setField('agreed', vals.includes('agreed'))}
              direction="vertical"
              options={[{ label: t('docs.apply.declaration'), value: 'agreed' }]}
            />
            <Divider type="hairline" />
            <div className="docs-apply-actions">
              <Button onClick={() => saveDraft()} loading={saving} icon={<SaveIcon />}>
                {t('docs.apply.saveDraft')}
              </Button>
              <Button type="primary" icon={<SendIcon />} onClick={() => setConfirming(true)} loading={busy}>
                {t('docs.apply.submit')}
              </Button>
              {appNo && (
                <span className="muted-text">
                  {t('docs.apply.draftNo', { no: appNo })}
                </span>
              )}
            </div>
          </Card>
        </>
      )}

      <Modal
        open={confirming}
        title={t('docs.apply.confirmTitle')}
        width={560}
        typewriter={false}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button type="primary" danger={false} loading={busy} onClick={submit}>
              {t('docs.apply.confirmSubmit')}
            </Button>
          </>
        }
      >
        {type && (
          <div className="docs-confirm">
            <p className="muted-text">{t('docs.apply.confirmTip')}</p>
            <dl className="docs-kv">
              <dt>{t('docs.apply.type')}</dt>
              <dd>{type.name}</dd>
              <dt>{t('docs.apply.nickname')}</dt>
              <dd>{form.nickname || '—'}</dd>
              <dt>{t('docs.apply.purpose')}</dt>
              <dd>{t(`docs.purpose.${form.purpose}`)}</dd>
              {type.bizNoLabel && (
                <>
                  <dt>{type.bizNoLabel}</dt>
                  <dd>{form.bizNo || '—'}</dd>
                </>
              )}
              <dt>{t('docs.apply.materialsCount')}</dt>
              <dd>{materials.length}</dd>
            </dl>
            <p className="docs-confirm-declare">{t('docs.apply.declaration')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
