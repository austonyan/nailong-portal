// 居民登记申请:选择类型 → 填写信息(草稿)→ 提交前确认(预览)。
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Title, Button, Card, Checkbox, Form, FormItem, Input, Modal, Tag, useForm } from 'animal-island-ui';
import { CheckCircleIcon, SaveIcon, SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { profileIdentity } from '../../lib/profileIdentity.js';
import { PURPOSES, TextArea, toastResError, toastResSuccess } from './shared.jsx';

// Card 只是带 onClick 的 div:补 role/tabIndex 后由这里接住 Enter/Space。
function cardKeyDown(handler) {
  return (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}

// 路由 /resident/apply 与 /resident/apply/:typeCode 复用同一个组件:React Router
// 按组件类型复用实例,useState 只在首次挂载时读路由参数。不按路由参数加 key 重挂载,
// 从类型选择页点进具体类型时 URL 会变、页面却停在选择页(看起来像点击无反应)。
export default function ResidentApply() {
  const params = useParams();
  const routeKey = params.typeCode
    ? `type:${String(params.typeCode).toUpperCase()}`
    : params.id
      ? `draft:${params.id}`
      : 'picker';
  return <ResidentApplyScreen key={routeKey} />;
}

function ResidentApplyScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const { user } = useAuth();
  // 门户身份档案:持卡人信息必须与个人资料一致,只有档案里为空的字段才让申请人手动填。
  const profile = profileIdentity(user);
  // 新申请:/resident/apply/:typeCode;编辑草稿:/resident/applications/:id/edit
  const draftId = params.id ? Number(params.id) : null;
  const [form] = useForm();
  const [appId, setAppId] = useState(draftId);
  const [appNo, setAppNo] = useState(null);
  const [typeCode, setTypeCode] = useState(params.typeCode ? String(params.typeCode).toUpperCase() : null);
  const [typeInfo, setTypeInfo] = useState(null);
  const [reviewHours, setReviewHours] = useState(72);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purposes, setPurposes] = useState([]);
  const [purposesError, setPurposesError] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const createdRef = useRef(false);

  useEffect(() => {
    api
      .get('/resident/home')
      .then((data) => setReviewHours(data.reviewHoursHint))
      .catch(() => {});
  }, []);

  // 载入草稿或按类型新建
  useEffect(() => {
    if (draftId) {
      api
        .get(`/resident/applications/${draftId}`)
        .then((data) => {
          const app = data.application;
          setAppNo(app.appNo);
          setTypeCode(app.typeCode);
          form.setFieldsValue({
            nickname: profile.realName || app.nickname,
            contact: profile.email || app.contact,
            virtualAddress: profile.address || app.virtualAddress,
            bio: app.bio,
          });
          setPurposes(app.purposes || []);
        })
        .catch((err) => toastResError(t, err));
    } else if (!createdRef.current && typeCode) {
      createdRef.current = true;
      api
        .post('/resident/applications', { typeCode })
        .then((data) => {
          setAppId(data.application.id);
          setAppNo(data.application.appNo);
          const app = data.application;
          form.setFieldsValue({
            nickname: profile.realName || app.nickname,
            contact: profile.email || app.contact,
            virtualAddress: profile.address || app.virtualAddress,
          });
        })
        .catch((err) => {
          toastResError(t, err);
          navigate('/resident/apply');
        });
    }
    // profile 每次渲染都是新对象,依赖拆成原始值,避免重复触发建档请求。
  }, [draftId, typeCode, form, t, navigate, profile.realName, profile.email, profile.address]);

  // 类型说明
  useEffect(() => {
    if (!typeCode) return;
    api
      .get(`/resident/types/${typeCode}`)
      .then((data) => setTypeInfo(data.type))
      .catch(() => setTypeInfo(null));
  }, [typeCode]);

  const saveDraft = async (silent = false) => {
    if (!appId) return;
    setBusy(true);
    try {
      const values = await form.getFieldsValue();
      await api.put(`/resident/applications/${appId}`, { ...values, purposes });
      if (!silent) toastResSuccess(t('res.form.draftSaved'));
    } catch (err) {
      if (!silent) toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = async () => {
    try {
      await form.validateFields();
      if (!purposes.length) {
        // 校验错误留在字段旁,不弹 toast(与整页 FormItem 错误行为一致)。
        setPurposesError(true);
        return;
      }
      await saveDraft(true);
      setConfirmOpen(true);
    } catch {
      // 表单校验失败,FormItem 已显示错误
    }
  };

  const doSubmit = async () => {
    setBusy(true);
    try {
      const values = await form.getFieldsValue();
      const data = await api.post(`/resident/applications/${appId}/submit`, values);
      setSubmitted(data.application);
      setConfirmOpen(false);
      toastResSuccess(t('res.form.submitSuccess'));
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (!typeCode && !draftId) {
    return <TypePicker />;
  }

  if (submitted) {
    return (
      <div className="res-form-page">
        <Card pattern="app-green" className="res-submitted-card">
          <CheckCircleIcon size={40} />
          <h1 className="page-title-card">{t('res.form.submittedTitle')}</h1>
          <p className="res-submitted-no">{t('res.form.submittedNo', { no: submitted.appNo })}</p>
          <p className="muted-text">{t('res.form.submittedHint', { hours: reviewHours })}</p>
          <div className="res-guide-actions">
            <Button onClick={() => navigate('/resident/applications')}>{t('res.form.viewMyApplications')}</Button>
            <Button type="primary" onClick={() => navigate('/resident')}>
              {t('res.backHome')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="res-form-page">
      <h1 className="page-title"><Title size="middle" color="lime-green">{t('res.form.title')}</Title></h1>
      {appNo && (
        <p className="muted-text">
          {t('res.form.draftNo', { no: appNo })}
          {typeInfo ? ` · ${typeInfo.name}` : ''}
        </p>
      )}
      {typeInfo && <p className="muted-text">{typeInfo.description}</p>}

      <Card type="dashed">
        <p>{t('res.form.profilePrefill')}</p>
        {profile.realName || profile.email || profile.address ? (
          <p className="muted-text">
            {t('res.form.profilePrefillIncomplete')} <Link to="/profile">{t('profile.openProfile')}</Link>
          </p>
        ) : (
          <p className="muted-text">
            {t('res.form.profileEmpty')} <Link to="/profile">{t('profile.openProfile')}</Link>
          </p>
        )}
      </Card>

      <Card className="res-form-card">
        <Form form={form} layout="vertical" requiredMark>
          <div className="res-form-grid">
            <FormItem
              name="nickname"
              label={t('res.form.nickname')}
              help={profile.realName ? t('profile.fromProfile') : undefined}
              rules={[{ required: true, message: t('res.form.nickname') }]}
            >
              <Input size="large" allowClear maxLength={40} disabled={!!profile.realName} placeholder={t('res.form.nicknamePlaceholder')} />
            </FormItem>
            <FormItem
              name="contact"
              label={t('res.form.contact')}
              help={profile.email ? t('profile.fromProfile') : undefined}
              rules={[{ required: true, message: t('res.form.contact') }]}
            >
              <Input size="large" allowClear maxLength={100} disabled={!!profile.email} placeholder={t('res.form.contactPlaceholder')} />
            </FormItem>
          </div>
          <FormItem
            name="virtualAddress"
            label={t('res.form.virtualAddress')}
            help={profile.address ? t('profile.fromProfile') : undefined}
            rules={[{ required: true, message: t('res.form.virtualAddress') }]}
          >
            <Input size="large" allowClear maxLength={200} disabled={!!profile.address} placeholder={t('res.form.virtualAddressPlaceholder')} />
          </FormItem>
          <div className="res-purposes-block">
            <label className="res-field-label">
              {t('res.form.purposes')} <span className="res-field-required">*</span>
            </label>
            <Checkbox
              options={PURPOSES.map((p) => ({ label: t(`res.purpose.${p}`), value: p }))}
              value={purposes}
              onChange={(next) => {
                setPurposes(next);
                if (next.length) setPurposesError(false);
              }}
            />
            {purposesError && <p className="res-field-error">{t('res.form.purposesRequired')}</p>}
          </div>
          <FormItem name="bio" label={`${t('res.form.bio')}(${t('common.optional')})`}>
            <TextArea maxLength={500} placeholder={t('res.form.bioPlaceholder')} />
          </FormItem>
        </Form>
      </Card>

      <div className="res-guide-actions">
        <Button onClick={() => navigate('/resident/applications')}>{t('res.back')}</Button>
        <Button icon={<SaveIcon />} loading={busy} onClick={() => saveDraft(false)} disabled={busy}>
          {t('res.form.saveDraft')}
        </Button>
        <Button type="primary" size="large" icon={<SendIcon />} onClick={openConfirm}>
          {t('res.form.submit')}
        </Button>
      </div>

      <Modal
        maskClosable={false}
        open={confirmOpen}
        title={t('res.form.confirmTitle')}
        onClose={() => setConfirmOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={doSubmit} disabled={busy}>
              {t('res.form.submit')}
            </Button>
          </>
        }
      >
        <div className="res-confirm-body">
          <dl className="res-confirm-list">
            <div>
              <dt>{t('res.form.nickname')}</dt>
              <dd>{form.getFieldValue('nickname')}</dd>
            </div>
            <div>
              <dt>{t('res.form.contact')}</dt>
              <dd>{form.getFieldValue('contact')}</dd>
            </div>
            <div>
              <dt>{t('res.form.virtualAddress')}</dt>
              <dd>{form.getFieldValue('virtualAddress')}</dd>
            </div>
            <div>
              <dt>{t('res.form.purposes')}</dt>
              <dd>{purposes.map((p) => t(`res.purpose.${p}`)).join('、')}</dd>
            </div>
          </dl>
        </div>
      </Modal>
    </div>
  );
}

// 第一步:选择居民类型
function TypePicker() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [types, setTypes] = useState(null);

  useEffect(() => {
    api
      .get('/resident/types')
      .then((data) => setTypes(data.items))
      .catch((err) => {
        toastResError(t, err);
        setTypes([]);
      });
  }, [t]);

  return (
    <div className="res-form-page">
      <h1 className="page-title"><Title size="middle" color="lime-green">{t('res.apply.pickType')}</Title></h1>
      <p className="muted-text">{t('res.apply.pickTypeTip')}</p>
      <div className="res-type-grid">
        {(types ?? []).map((type) => (
          <Card
            key={type.code}
            hoverable
            className="res-type-card"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/resident/apply/${type.code}`)}
            onKeyDown={cardKeyDown(() => navigate(`/resident/apply/${type.code}`))}
          >
            <div className="res-type-head">
              <b>{type.name}</b>
              <Tag color="app-green" variant="soft" size="small">
                {t('res.type.validYears', { years: type.validYears })}
              </Tag>
            </div>
            <p className="muted-text">{type.description}</p>
          </Card>
        ))}
        {types === null && (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        )}
        {types !== null && types.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('res.home.noTypes')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
