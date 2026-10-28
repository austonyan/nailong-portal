// 在线申请表单:草稿保存、材料上传、提交前确认(预览)。
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, DatePicker, Form, FormItem, Input, Modal, Tag, Title, Upload, useForm } from 'animal-island-ui';
import { CheckCircleIcon, PaperclipIcon, SaveIcon, SendIcon, TrashIcon } from 'naive-icons';
import { api, ApiError } from '../../api/client.js';
import { uploadVisaMaterial } from '../../api/visa.js';
import { TextArea, fmtDate, toastVisaError } from './shared.jsx';
import { toastSuccess, toastError } from '../../components/toast.js';
import ResidentPrefill from '../../components/linkage/ResidentPrefill.jsx';

// 路由 /visa/apply/:typeCode/form 与 /visa/applications/:id/edit 复用同一个组件:React
// Router 按树位置+组件类型复用实例,useState 只在首次挂载时读路由参数。不加 key 重挂载,
// 从 TOURIST 表单切到 BUSINESS 表单、或从草稿 12 的编辑页切到草稿 15,会沿用上一条草稿的
// appId/typeCode/材料/表单值(居民署 ResidentApply 同一写法)。
export default function VisaApplyForm() {
  const params = useParams();
  const routeKey = params.id
    ? `draft:${params.id}`
    : params.typeCode
      ? `type:${String(params.typeCode).toUpperCase()}`
      : 'picker';
  return <VisaApplyScreen key={routeKey} />;
}

function VisaApplyScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  // 新申请:/visa/apply/:typeCode/form;编辑草稿:/visa/applications/:id/edit
  const draftId = params.id ? Number(params.id) : null;
  const [form] = useForm();
  const [appId, setAppId] = useState(draftId);
  const [appNo, setAppNo] = useState(null);
  const [typeCode, setTypeCode] = useState(params.typeCode || null);
  const [typeInfo, setTypeInfo] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [reviewHours, setReviewHours] = useState(72);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const createdRef = useRef(false);

  useEffect(() => {
    api
      .get('/visa/home')
      .then((data) => setReviewHours(data.reviewHoursHint))
      .catch(() => {});
  }, []);

  // 载入草稿或按类型新建
  useEffect(() => {
    if (draftId) {
      api
        .get(`/visa/applications/${draftId}`)
        .then((data) => {
          const app = data.application;
          setAppNo(app.appNo);
          setTypeCode(app.typeCode);
          form.setFieldsValue({
            nickname: app.nickname,
            contact: app.contact,
            virtualId: app.virtualId,
            purpose: app.purpose,
            planArrive: app.planArrive,
            planLeave: app.planLeave,
            itinerary: app.itinerary,
            inviterName: app.inviterName,
            inviterContact: app.inviterContact,
            companions: app.companions,
          });
          setMaterials(app.materials || []);
        })
        .catch((err) => toastVisaError(t, err));
    } else if (!createdRef.current && typeCode) {
      createdRef.current = true;
      api
        .post('/visa/applications', { typeCode })
        .then((data) => {
          setAppId(data.application.id);
          setAppNo(data.application.appNo);
        })
        .catch((err) => {
          toastVisaError(t, err);
          navigate('/visa/apply');
        });
    }
  }, [draftId, typeCode, form, t, navigate]);

  // 类型说明
  useEffect(() => {
    if (!typeCode) return;
    api
      .get('/visa/types')
      .then((data) => setTypeInfo(data.items.find((item) => item.code === typeCode) || null))
      .catch(() => setTypeInfo(null));
  }, [typeCode]);

  // 行程日期先后校验。DatePicker 的值是 YYYY-MM-DD 字符串,字典序即时间序。
  // 库的 validator 契约(validators.js:83):返回非空字符串=错误,返回 undefined=通过;
  // 库不实现 FormItem 的 `dependencies`,所以抵达/离开两侧都挂同一条规则,
  // 无论用户先填哪一边都能当场报错,而不是等到提交。
  const checkTripOrder = (leave, arrive) => {
    if (!leave || !arrive) return undefined;
    return leave > arrive ? undefined : t('visa.form.datesInvalid');
  };

  const collectValues = async () => {
    const values = await form.validateFields();
    return {
      ...values,
      planArrive: values.planArrive || undefined,
      planLeave: values.planLeave || undefined,
    };
  };

  const saveDraft = async (silent = false) => {
    if (!appId) return;
    setBusy(true);
    try {
      const values = await form.getFieldsValue();
      await api.put(`/visa/applications/${appId}`, {
        ...values,
        planArrive: values.planArrive || undefined,
        planLeave: values.planLeave || undefined,
      });
      if (!silent) toastSuccess(t('visa.form.draftSaved'));
    } catch (err) {
      if (!silent) toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const uploadMaterial = (kind) => ({ file, onProgress, onSuccess, onError }) => {
    if (!appId) {
      // 草稿还没建好(POST /visa/applications 尚未返回):报错误码,让 i18n 出简繁文案,
      // 不要把原始英文 'draft not ready' 抛给用户。
      const err = new ApiError(409, 'VISA_DRAFT_NOT_READY');
      toastVisaError(t, err);
      onError(err);
      return;
    }
    uploadVisaMaterial({ applicationId: appId, kind, file, onProgress })
      .then((material) => {
        setMaterials((prev) => [...prev.filter((m) => !(kind === 'avatar' && m.kind === 'avatar')), material]);
        onSuccess(material);
      })
      .catch((err) => {
        toastVisaError(t, err);
        onError(err);
      });
  };

  const removeMaterial = async (material) => {
    try {
      await api.del(`/visa/materials/${material.id}`);
      setMaterials((prev) => prev.filter((m) => m.id !== material.id));
    } catch (err) {
      toastVisaError(t, err);
    }
  };

  const openConfirm = async () => {
    try {
      await form.validateFields();
    } catch {
      // 表单校验失败,FormItem 已显示错误
      return;
    }
    // 文案与《申请指南》都写着「头像必传」,服务端提交时也是 400 VISA_AVATAR_REQUIRED;
    // 以前这里只 validateFields(),用户填完确认完才被服务端打回,现在先在前端拦住。
    if (!materials.some((m) => m.kind === 'avatar')) {
      toastError(t('visa.form.avatarRequired'));
      return;
    }
    if (!appId) {
      toastVisaError(t, new ApiError(409, 'VISA_DRAFT_NOT_READY'));
      return;
    }
    await saveDraft(true);
    setConfirmOpen(true);
  };

  const doSubmit = async () => {
    setBusy(true);
    try {
      const values = await form.getFieldsValue();
      const data = await api.post(`/visa/applications/${appId}/submit`, values);
      setSubmitted(data.application);
      setConfirmOpen(false);
      toastSuccess(t('visa.form.submitSuccess'));
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  // 只写入确实拿到的真实值(见 ResidentPrefill:居民证只暴露证件号)。
  // 之前无条件 `data.nickname || ''` 会把用户已填的昵称/联系方式清空。
  const fillFromResident = (data) => {
    if (!data) return;
    const patch = {};
    if (data.virtualId) patch.virtualId = data.virtualId;
    if (data.nickname) patch.nickname = data.nickname;
    if (data.contact) patch.contact = data.contact;
    if (!Object.keys(patch).length) {
      toastError(t('residentPrefill.nothing'));
      return;
    }
    form.setFieldsValue(patch);
    toastSuccess(t('residentPrefill.filled'));
  };

  if (submitted) {
    return (
      <div className="visa-form-page">
        <Card color="app-teal" className="visa-submitted-card">
          <CheckCircleIcon size={40} />
          <h3>{t('visa.form.submittedTitle')}</h3>
          <p className="visa-submitted-no">{t('visa.form.submittedNo', { no: submitted.appNo })}</p>
          <p className="muted-text">{t('visa.form.submittedHint', { hours: reviewHours })}</p>
          <div className="visa-guide-actions">
            <Button onClick={() => navigate('/visa/applications')}>{t('visa.form.viewMyApplications')}</Button>
            <Button type="primary" onClick={() => navigate('/visa')}>
              {t('visa.backHome')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const avatarMaterial = materials.find((m) => m.kind === 'avatar');
  const otherMaterials = materials.filter((m) => m.kind !== 'avatar');

  return (
    <div className="visa-form-page">
      <Title size="middle" color="app-teal">
        {t('visa.form.title')}
      </Title>
      {appNo && (
        <p className="muted-text">
          {t('visa.form.draftNo', { no: appNo })}
          {typeInfo ? ` · ${typeInfo.name}` : ''}
        </p>
      )}

      <Card className="visa-form-card">
        <ResidentPrefill onFill={fillFromResident} />
        <Form form={form} layout="vertical" requiredMark>
          <div className="visa-form-grid">
            <FormItem name="nickname" label={t('visa.form.nickname')} rules={[{ required: true, message: t('visa.form.nickname') }]}>
              <Input size="large" allowClear maxLength={40} placeholder={t('visa.form.nicknamePlaceholder')} />
            </FormItem>
            <FormItem name="contact" label={t('visa.form.contact')} rules={[{ required: true, message: t('visa.form.contact') }]}>
              <Input size="large" allowClear maxLength={100} placeholder={t('visa.form.contactPlaceholder')} />
            </FormItem>
            <FormItem name="virtualId" label={t('visa.form.virtualId')}>
              <Input size="large" allowClear maxLength={200} placeholder={t('visa.form.virtualIdPlaceholder')} />
            </FormItem>
          </div>
          <FormItem name="purpose" label={t('visa.form.purpose')} rules={[{ required: true, message: t('visa.form.purpose') }]}>
            <TextArea maxLength={500} placeholder={t('visa.form.purposePlaceholder')} />
          </FormItem>
          <div className="visa-form-grid">
            <FormItem
              name="planArrive"
              label={t('visa.form.planArrive')}
              rules={[
                { required: true, message: t('visa.form.planArrive') },
                // 两侧都校验先后:库不认 `dependencies`,只挂在离开一侧时,
                // 先填离开、后填抵达就看不到错误(提交时才会被拦住)。
                { validator: (_rule, value) => checkTripOrder(form.getFieldValue('planLeave'), value) },
              ]}
            >
              <DatePicker allowClear placeholder={t('visa.form.datePlaceholder')} />
            </FormItem>
            <FormItem
              name="planLeave"
              label={t('visa.form.planLeave')}
              dependencies={['planArrive']}
              rules={[
                { required: true, message: t('visa.form.planLeave') },
                {
                  // 「离开要晚于抵达」,与 server/routes/visa.js:115 的
                  // `planLeave <= planArrive` 同一条规则(相等也算无效)。
                  // 空值交给上面的 required 规则,这里只管顺序。
                  validator: (_rule, value) => checkTripOrder(value, form.getFieldValue('planArrive')),
                },
              ]}
            >
              <DatePicker allowClear placeholder={t('visa.form.datePlaceholder')} />
            </FormItem>
          </div>
          <FormItem name="itinerary" label={t('visa.form.itinerary')} rules={[{ required: true, message: t('visa.form.itinerary') }]}>
            <TextArea maxLength={2000} placeholder={t('visa.form.itineraryPlaceholder')} />
          </FormItem>
          <div className="visa-form-grid">
            <FormItem name="inviterName" label={`${t('visa.form.inviterName')}(${t('common.optional')})`}>
              <Input size="large" allowClear maxLength={40} />
            </FormItem>
            <FormItem name="inviterContact" label={`${t('visa.form.inviterContact')}(${t('common.optional')})`}>
              <Input size="large" allowClear maxLength={100} />
            </FormItem>
          </div>
          <FormItem name="companions" label={`${t('visa.form.companions')}(${t('common.optional')})`}>
            <Input size="large" allowClear maxLength={200} placeholder={t('visa.form.companionsPlaceholder')} />
          </FormItem>
        </Form>
      </Card>

      <Card className="visa-form-card">
        <h4>
          <PaperclipIcon size={18} /> {t('visa.form.materialsTitle')}
        </h4>
        <p className="muted-text">{t('visa.form.materialsTip')}</p>
        {!appId ? (
          // 草稿号还没回来时不渲染上传入口:内层触发器禁用了也能拖文件,
          // 而且用户看不出为什么不能传。这里直接给「准备中」状态。
          <Card type="dashed">
            <p className="muted-text">{t('visa.form.draftPreparing')}</p>
          </Card>
        ) : (
        <div className="visa-materials-section">
          <div className="visa-materials-block">
            <h5>{t('visa.form.materialAvatar')}</h5>
            <Upload
              accept="image/*,application/pdf"
              maxCount={1}
              showUploadList={false}
              customRequest={uploadMaterial('avatar')}
            >
              {t('visa.form.uploadAvatar')}
            </Upload>
            {avatarMaterial && (
              <div className="visa-material-row">
                <Tag color="app-teal" variant="soft">
                  {t(`visa.materialKind.${avatarMaterial.kind}`)}
                </Tag>
                <span className="visa-material-name">{avatarMaterial.filename}</span>
                <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => removeMaterial(avatarMaterial)}>
                  {t('common.delete')}
                </Button>
              </div>
            )}
          </div>
          <div className="visa-materials-block">
            <h5>{t('visa.form.materialOther')}</h5>
            <Upload
              drag
              accept="image/*,application/pdf"
              maxCount={6}
              showUploadList={false}
              customRequest={uploadMaterial('other')}
            >
              <div style={{ padding: 24 }}>{t('visa.form.uploadOther')}</div>
            </Upload>
            {otherMaterials.map((m) => (
              <div key={m.id} className="visa-material-row">
                <Tag variant="soft" color="app-blue">
                  {t(`visa.materialKind.${m.kind}`)}
                </Tag>
                <span className="visa-material-name">{m.filename}</span>
                <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => removeMaterial(m)}>
                  {t('common.delete')}
                </Button>
              </div>
            ))}
          </div>
        </div>
        )}
      </Card>

      <div className="visa-guide-actions">
        <Button onClick={() => navigate('/visa/applications')}>{t('visa.back')}</Button>
        <Button icon={<SaveIcon />} loading={busy} onClick={() => saveDraft(false)} disabled={busy}>
          {t('visa.form.saveDraft')}
        </Button>
        <Button type="primary" size="large" icon={<SendIcon />} onClick={openConfirm} loading={busy} disabled={busy}>
          {t('visa.form.submit')}
        </Button>
      </div>

      <Modal
        maskClosable={false}
        open={confirmOpen}
        title={t('visa.form.confirmTitle')}
        onClose={() => {
          if (busy) return; // 提交在飞时不许关窗
          setConfirmOpen(false);
        }}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={doSubmit} disabled={busy}>
              {t('visa.form.submit')}
            </Button>
          </>
        }
      >
        <div className="visa-confirm-body">
          <dl className="visa-confirm-list">
            <div>
              <dt>{t('visa.form.nickname')}</dt>
              <dd>{form.getFieldValue('nickname')}</dd>
            </div>
            <div>
              <dt>{t('visa.form.planArrive')}</dt>
              <dd>
                {fmtDate(form.getFieldValue('planArrive'))} ~ {fmtDate(form.getFieldValue('planLeave'))}
              </dd>
            </div>
            <div>
              <dt>{t('visa.form.purpose')}</dt>
              <dd>{form.getFieldValue('purpose')}</dd>
            </div>
            <div>
              <dt>{t('visa.form.materialsTitle')}</dt>
              <dd>{t('visa.form.materialsCount', { count: materials.length })}</dd>
            </div>
          </dl>
        </div>
      </Modal>
    </div>
  );
}
