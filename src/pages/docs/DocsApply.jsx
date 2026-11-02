import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Title, Button, Card, Input, Modal, Radio } from 'animal-island-ui';
import { SaveIcon, SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { PURPOSE_KEYS } from '../../api/docs.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { profileIdentity } from '../../lib/profileIdentity.js';
import LinkageField from '../../components/linkage/LinkageField.jsx';
import ResidentPrefill from '../../components/linkage/ResidentPrefill.jsx';
import { DOC_BIZ_SOURCE } from '../../components/linkage/shared.js';
import { toastSuccess, toastError, toastWarning } from '../../components/toast.js';

const emptyForm = {
  nickname: '',
  contact: '',
  bizNo: '',
  purpose: 'display',
  formData: {},
};

// 文书类型只认一个"最常用"的记录种类;未列出的来源允许选择该署全部个人记录。
const DOC_BIZ_KIND = {
  visa: 'permit',
  resident: 'card',
  appeal: 'decision',
};

export default function DocsApply() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  // 申请人姓名与联系方式跟门户身份档案保持一致。
  const profile = profileIdentity(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [types, setTypes] = useState(null);
  const [typeCode, setTypeCode] = useState(searchParams.get('type') || '');
  const [form, setForm] = useState(() => ({ ...emptyForm, nickname: profile.realName, contact: profile.email }));
  const [appId, setAppId] = useState(null);
  const [appNo, setAppNo] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let cancelled = false;
    api
      .get('/docs/types')
      .then((d) => {
        if (!cancelled) setTypes(d.items);
      })
      .catch((err) => {
        toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const type = useMemo(() => types?.find((tp) => tp.code === typeCode) || null, [types, typeCode]);

  // 载入草稿。依赖用 draft 参数本身:searchParams 是每次渲染都新建的对象,
  // 放进依赖数组会让这个草稿请求随任何一次重渲染重跑(包括用户正在填表时)。
  const draftParam = searchParams.get('draft');
  useEffect(() => {
    const draftId = draftParam;
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
        setForm({
          nickname: profile.realName || item.nickname || '',
          contact: profile.email || item.contact || '',
          bizNo: item.bizNo || '',
          purpose: item.purpose || 'display',
          formData: item.formData || {},
        });
      })
      .catch((err) => toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') })));
    return () => {
      cancelled = true;
    };
  }, [draftParam, navigate, t, profile.realName, profile.email]);

  // 任一字段被编辑时清掉对应错误;错误在提交时统一收集,就近显示在字段下方。
  const setField = (key, value) => {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setFormField = (key, value) => {
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setForm((f) => ({ ...f, formData: { ...f.formData, [key]: value } }));
  };

  const payload = useCallback(
    () => ({
      typeCode,
      nickname: form.nickname,
      contact: form.contact,
      bizNo: form.bizNo,
      purpose: form.purpose,
      formData: form.formData,
    }),
    [typeCode, form]
  );

  const saveDraft = useCallback(
    async ({ silent = false } = {}) => {
      if (!type) return null;
      setSaving(true);
      try {
        if (appId) {
          await api.patch(`/docs/applications/${appId}`, payload());
          if (!silent) toastSuccess(t('docs.apply.draftSaved'));
          return appId;
        }
        const d = await api.post('/docs/applications', payload());
        setAppId(d.item.id);
        setAppNo(d.item.appNo);
        if (!silent) toastSuccess(t('docs.apply.draftSaved'));
        return d.item.id;
      } catch (err) {
        toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [appId, payload, type, t]
  );

  const collectFieldErrors = () => {
    const errs = {};
    if (!form.nickname.trim()) errs.nickname = t('docs.apply.nicknameRequired');
    if (type?.bizRequired && !form.bizNo.trim()) errs.bizNo = t('docs.apply.bizRequired', { label: type.bizNoLabel });
    for (const f of type?.formFields || []) {
      if (f.required && !String(form.formData[f.key] || '').trim()) errs[f.key] = t('docs.apply.fieldRequired', { label: f.label });
    }
    return errs;
  };

  const submit = async () => {
    const errs = collectFieldErrors();
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
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
      const d = await api.post(`/docs/applications/${id}/submit`, {});
      toastSuccess(t('docs.apply.submitted', { no: d.item.appNo }));
      setConfirming(false);
      navigate(`/docs/applications/${d.item.id}`);
    } catch (err) {
      toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
    } finally {
      setBusy(false);
    }
  };

  const fillFromResident = (data) => {
    if (!data) return;
    // 身份接口只提供证件号,本表单没有对应字段:只写确实带回的值,不要清空用户已填内容。
    const patch = {};
    if (data.nickname) patch.nickname = data.nickname;
    if (data.contact) patch.contact = data.contact;
    if (!Object.keys(patch).length) {
      toastError(t('residentPrefill.nothing'));
      return;
    }
    setForm((f) => ({ ...f, ...patch }));
    toastSuccess(t('residentPrefill.filled'));
  };

  const pickType = (code) => {
    if (appId) {
      toastWarning(t('docs.apply.typeLocked'));
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
      <h1 className="page-title"><Title size="middle" color="brown">{t('docs.apply.title')}</Title></h1>

      <Card className="docs-block">
        <h2 className="docs-block-title">{t('docs.apply.step1')}</h2>
        <div className="docs-type-picker">
          {types.map((tp) => (
            <button
              key={tp.code}
              type="button"
              className={tp.code === typeCode ? 'docs-type-option active' : 'docs-type-option'}
              disabled={!!appId}
              onClick={() => pickType(tp.code)}
            >
              <strong>{tp.name}</strong>
              <span className="muted-text">{tp.code}</span>
            </button>
          ))}
        </div>
        {appId && <p className="muted-text docs-field-hint">{t('docs.apply.typeLocked')}</p>}
      </Card>

      {type && (
        <>
          <Card className="docs-block">
            <ResidentPrefill onFill={fillFromResident} fields={['nickname', 'contact']} />
            <h3 className="docs-block-title">{t('docs.apply.step2')}</h3>
            <div className="docs-form-grid">
              <label className="docs-field">
                <span className="docs-field-label">
                  {t('docs.apply.nickname')} <em>*</em>
                </span>
                <Input
                  value={form.nickname}
                  onChange={(e) => setField('nickname', e.target.value)}
                  placeholder={t('docs.apply.nicknamePh')}
                  allowClear
                  maxLength={60}
                  disabled={!!profile.realName}
                />
                {profile.realName && <small className="muted-text">{t('profile.fromProfile')}</small>}
                {fieldErrors.nickname && <small className="docs-field-error">{fieldErrors.nickname}</small>}
              </label>
              <label className="docs-field">
                <span className="docs-field-label">{t('docs.apply.contact')}</span>
                <Input value={form.contact} onChange={(e) => setField('contact', e.target.value)} placeholder={t('docs.apply.contactPh')} allowClear maxLength={120} />
              </label>
              {type.bizNoLabel && (
                <div className="docs-field">
                  <span className="docs-field-label">
                    {type.bizNoLabel} {type.bizRequired && <em>*</em>}
                  </span>
                  <LinkageField
                    consumer="docs_apply"
                    source={DOC_BIZ_SOURCE[type.bizSource] || ''}
                    kind={DOC_BIZ_KIND[type.bizSource]}
                    credentialLabel={type.bizNoLabel}
                    required={type.bizRequired}
                    disabled={busy || saving}
                    placeholder={t('docs.apply.bizPh')}
                    value={form.bizNo}
                    onChange={(next) => setField('bizNo', String(next || '').toUpperCase())}
                  />
                  <span className="muted-text docs-field-hint">{t('docs.apply.bizHint', { label: type.bizNoLabel })}</span>
                  {fieldErrors.bizNo && <small className="docs-field-error">{fieldErrors.bizNo}</small>}
                </div>
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
                  {fieldErrors[f.key] && <small className="docs-field-error">{fieldErrors[f.key]}</small>}
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
            <div className="docs-apply-actions">
              <Button onClick={() => saveDraft()} loading={saving} icon={<SaveIcon />} disabled={saving}>
                {t('docs.apply.saveDraft')}
              </Button>
              <Button type="primary" icon={<SendIcon />} onClick={() => setConfirming(true)} loading={busy} disabled={busy}>
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
        maskClosable={false}
        open={confirming}
        title={t('docs.apply.confirmTitle')}
        width={560}
        typewriter={false}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button type="primary" danger={false} loading={busy} onClick={submit} disabled={busy}>
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
              {(type.formFields || []).map((f) => (
                <Fragment key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{String(form.formData[f.key] || '') || '—'}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}
