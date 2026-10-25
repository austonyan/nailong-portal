// 在线申请表单:草稿保存、材料上传、提交前确认(预览)。
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  DatePicker,
  Form,
  FormItem,
  Input,
  Modal,
  Notification,
  Tag,
  Title,
  Upload,
  useForm,
} from 'animal-island-ui';
import { CheckCircleIcon, PaperclipIcon, SaveIcon, SendIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { uploadVisaMaterial } from '../../api/visa.js';
import { TextArea, fmtDate, toastVisaError } from './shared.jsx';

export default function VisaApplyForm() {
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
      if (!silent) Notification.success(t('visa.form.draftSaved'));
    } catch (err) {
      if (!silent) toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const uploadMaterial = (kind) => ({ file, onProgress, onSuccess, onError }) => {
    if (!appId) {
      onError(new Error('draft not ready'));
      return;
    }
    uploadVisaMaterial({ applicationId: appId, kind, file, onProgress })
      .then((material) => {
        setMaterials((prev) => [...prev.filter((m) => !(kind === 'avatar' && m.kind === 'avatar')), material]);
        onSuccess(material);
      })
      .catch((err) => {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
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
      await saveDraft(true);
      setConfirmAgree([]);
      setConfirmOpen(true);
    } catch {
      // 表单校验失败,FormItem 已显示错误
    }
  };

  const doSubmit = async () => {
    setBusy(true);
    try {
      const values = await form.getFieldsValue();
      const data = await api.post(`/visa/applications/${appId}/submit`, values);
      setSubmitted(data.application);
      setConfirmOpen(false);
      Notification.success(t('visa.form.submitSuccess'));
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
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
            <FormItem name="planArrive" label={t('visa.form.planArrive')} rules={[{ required: true, message: t('visa.form.planArrive') }]}>
              <DatePicker allowClear placeholder={t('visa.form.datePlaceholder')} />
            </FormItem>
            <FormItem
              name="planLeave"
              label={t('visa.form.planLeave')}
              dependencies={['planArrive']}
              rules={[
                { required: true, message: t('visa.form.planLeave') },
                {
                  validator: (_rule, value) => {
                    const arrive = form.getFieldValue('planArrive');
                    if (!value || !arrive || value > arrive) return;
                    return Promise.reject(new Error(t('visa.form.datesInvalid')));
                  },
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
        <div className="visa-materials-section">
          <div className="visa-materials-block">
            <h5>{t('visa.form.materialAvatar')}</h5>
            <Upload
              accept="image/*,application/pdf"
              maxCount={1}
              showUploadList={false}
              customRequest={uploadMaterial('avatar')}
              disabled={!appId}
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
              disabled={!appId}
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
      </Card>

      <div className="visa-guide-actions">
        <Button onClick={() => navigate('/visa/applications')}>{t('visa.back')}</Button>
        <Button icon={<SaveIcon />} loading={busy} onClick={() => saveDraft(false)}>
          {t('visa.form.saveDraft')}
        </Button>
        <Button type="primary" size="large" icon={<SendIcon />} onClick={openConfirm}>
          {t('visa.form.submit')}
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        title={t('visa.form.confirmTitle')}
        onClose={() => setConfirmOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={doSubmit}>
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
