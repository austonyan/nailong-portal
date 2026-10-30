// 结果申诉表单:选择业务与编号 → 建草稿 → 填写理由/期望/联系方式 → 材料 →
// 提交前确认(预览)→ 生成申诉编号。/appeal/apply/:id 编辑草稿。
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Form, FormItem, Input, Modal, Select, Tag, Title, Upload, useForm } from 'animal-island-ui';
import { CheckCircleIcon, PaperclipIcon, SaveIcon, SendIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { uploadAppealMaterial } from '../../api/appeal.js';
import LinkageField from '../../components/linkage/LinkageField.jsx';
import { BIZ_TYPES, MATERIAL_KINDS, TextArea, fmtDateTime, toastAppealError } from './shared.jsx';
import { toastSuccess, toastError } from '../../components/toast.js';

export default function AppealApply() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const draftId = params.id ? Number(params.id) : null;
  const [form] = useForm();
  const [appeal, setAppeal] = useState(null);
  const [bizType, setBizType] = useState('visa');
  const [bizCode, setBizCode] = useState('');
  const [materials, setMaterials] = useState([]);
  const [hints, setHints] = useState({ supplementDays: 7, reviewDays: 15, acceptSlaHours: 48 });
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const creatingRef = useRef(false);

  useEffect(() => {
    api.get('/appeal/home').then((data) => setHints(data.hints || {})).catch(() => {});
  }, []);

  useEffect(() => {
    if (!draftId) return;
    api
      .get(`/appeal/appeals/${draftId}`)
      .then((data) => {
        setAppeal(data.appeal);
        setBizType(data.appeal.bizType);
        setBizCode(data.appeal.bizCode);
        form.setFieldsValue({
          reason: data.appeal.reason,
          expected: data.appeal.expected,
          contact: data.appeal.contact,
        });
        setMaterials(data.appeal.materials || []);
      })
      .catch((err) => {
        toastAppealError(t, err);
        navigate('/appeal/apply');
      });
  }, [draftId, form, t, navigate]);

  const createDraft = async () => {
    if (creatingRef.current) return;
    setBusy(true);
    try {
      const data = await api.post('/appeal/appeals', { bizType, bizCode });
      setAppeal(data.appeal);
      navigate(`/appeal/apply/${data.appeal.id}`, { replace: true });
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (silent = false) => {
    if (!appeal) return;
    setBusy(true);
    try {
      const values = await form.getFieldsValue();
      const data = await api.put(`/appeal/appeals/${appeal.id}`, values);
      setAppeal(data.appeal);
      if (!silent) toastSuccess(t('common.saved'));
    } catch (err) {
      if (!silent) toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const uploadMaterial = (kind) => ({ file, onProgress, onSuccess, onError }) => {
    if (!appeal) {
      onError(new Error('draft not ready'));
      return;
    }
    uploadAppealMaterial({ ownerType: 'appeal', ownerId: appeal.id, kind, file, onProgress })
      .then((material) => {
        setMaterials((prev) => [...prev, material]);
        onSuccess(material);
      })
      .catch((err) => {
        toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
        onError(err);
      });
  };

  const removeMaterial = async (material) => {
    try {
      await api.del(`/appeal/materials/${material.id}`);
      setMaterials((prev) => prev.filter((m) => m.id !== material.id));
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const openConfirm = async () => {
    try {
      await form.validateFields();
      await saveDraft(true);
      setConfirmOpen(true);
    } catch {
      // 表单校验失败,FormItem 已显示错误
    }
  };

  const doSubmit = async () => {
    if (!appeal) return;
    setBusy(true);
    try {
      const data = await api.post(`/appeal/appeals/${appeal.id}/submit`, {});
      setSubmitted(data.appeal);
      setConfirmOpen(false);
      toastSuccess(t('appeal.apply.submitSuccess'));
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="appeal-form-page">
        <Card pattern="app-teal" className="appeal-submitted-card">
          <CheckCircleIcon size={40} />
          <h1 className="page-title-card">{t('appeal.apply.submittedTitle')}</h1>
          <p className="appeal-submitted-no">{t('appeal.apply.submittedNo', { no: submitted.code })}</p>
          <p className="muted-text">{t('appeal.apply.submittedHint', { hours: hints.acceptSlaHours })}</p>
          <div className="appeal-guide-actions">
            <Button onClick={() => navigate('/appeal/my')}>{t('appeal.apply.viewMy')}</Button>
            <Button type="primary" onClick={() => navigate('/appeal')}>
              {t('appeal.backHome')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="appeal-form-page">
      <h1 className="page-title">
        <Title size="middle" color="app-teal">
          {t('appeal.apply.title')}
        </Title>
      </h1>
      {appeal && (
        <p className="muted-text">
          {t('appeal.apply.draftNo', { no: appeal.code })} · {t(`appeal.status.${appeal.status}`)}
        </p>
      )}

      <Card className="appeal-form-card">
        <h2>{t('appeal.apply.bizTitle')}</h2>
        <p className="muted-text">{t('appeal.apply.bizTip')}</p>
        <div className="appeal-biz-row">
          <Select
            value={bizType}
            onChange={(value) => {
              setBizType(value);
              if (!appeal) setBizCode('');
            }}
            disabled={!!appeal}
            options={BIZ_TYPES.map((b) => ({ key: b, label: t(`appeal.bizType.${b}`) }))}
          />
          {appeal ? (
            <Input size="large" disabled value={bizCode} />
          ) : (
            <LinkageField
              consumer="appeal_apply"
              source={bizType}
              credentialLabel={t(`linkage.credential.${bizType}`)}
              placeholder={t('appeal.apply.bizCodePlaceholder')}
              disabled={busy}
              value={bizCode}
              onChange={(next) => setBizCode(String(next || ''))}
            />
          )}
          {!appeal && (
            <Button type="primary" loading={busy} disabled={busy || (!bizCode.trim())} onClick={createDraft}>
              {t('appeal.apply.createDraft')}
            </Button>
          )}
        </div>
        {appeal && appeal.bizStatus && (
          <Tag color={appeal.bizStatus === 'verified' ? 'app-green' : 'warm-peach-pink'} variant="soft">
            {t(`appeal.bizStatus.${appeal.bizStatus}`, { defaultValue: t('common.unknown') })}
          </Tag>
        )}
      </Card>

      <Card className="appeal-form-card">
        <Form form={form} layout="vertical" requiredMark>
          <FormItem name="reason" label={t('appeal.apply.reason')} rules={[{ required: true, message: t('appeal.apply.reason') }]}>
            <TextArea maxLength={2000} placeholder={t('appeal.apply.reasonPlaceholder')} disabled={!appeal} />
          </FormItem>
          <FormItem name="expected" label={t('appeal.apply.expected')} rules={[{ required: true, message: t('appeal.apply.expected') }]}>
            <TextArea rows={3} maxLength={500} placeholder={t('appeal.apply.expectedPlaceholder')} disabled={!appeal} />
          </FormItem>
          <FormItem name="contact" label={t('appeal.apply.contact')} rules={[{ required: true, message: t('appeal.apply.contact') }]}>
            <Input size="large" allowClear maxLength={100} placeholder={t('appeal.apply.contactPlaceholder')} disabled={!appeal} />
          </FormItem>
        </Form>
      </Card>

      <Card className="appeal-form-card">
        <h2>
          <PaperclipIcon size={18} /> {t('appeal.apply.materialsTitle')}
        </h2>
        <p className="muted-text">{t('appeal.apply.materialsTip')}</p>
        <div className="appeal-materials-section">
          <Upload
            drag
            accept="image/*,application/pdf"
            maxCount={6}
            showUploadList={false}
            customRequest={uploadMaterial('screenshot')}
            disabled={!appeal || appeal.status !== 'draft'}
          >
            <div style={{ padding: 24 }}>{t('appeal.apply.uploadScreenshot')}</div>
          </Upload>
          <Upload
            accept="image/*,application/pdf"
            maxCount={6}
            showUploadList={false}
            customRequest={uploadMaterial('proof')}
            disabled={!appeal || appeal.status !== 'draft'}
          >
            {t('appeal.apply.uploadProof')}
          </Upload>
        </div>
        {materials.map((m) => (
          <div key={m.id} className="appeal-material-row">
            <Tag color={m.origin === 'supplement' ? 'warm-peach-pink' : 'app-blue'} variant="soft">
              {t(`appeal.materialKind.${m.kind}`)}
            </Tag>
            <span className="appeal-material-name">{m.filename}</span>
            <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => removeMaterial(m)}>
              {t('common.delete')}
            </Button>
          </div>
        ))}
      </Card>

      <div className="appeal-guide-actions">
        <Button onClick={() => navigate('/appeal/my')}>{t('appeal.back')}</Button>
        <Button icon={<SaveIcon />} loading={busy} disabled={busy || (!appeal)} onClick={() => saveDraft(false)}>
          {t('appeal.apply.saveDraft')}
        </Button>
        <Button type="primary" size="large" icon={<SendIcon />} disabled={!appeal} onClick={openConfirm}>
          {t('appeal.apply.submit')}
        </Button>
      </div>

      <Modal
        maskClosable={false}
        open={confirmOpen}
        title={t('appeal.apply.confirmTitle')}
        onClose={() => setConfirmOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={doSubmit} disabled={busy}>
              {t('appeal.apply.submit')}
            </Button>
          </>
        }
      >
        <div className="appeal-confirm-body">
          <dl className="appeal-confirm-list">
            <div>
              <dt>{t('appeal.apply.bizType')}</dt>
              <dd>{t(`appeal.bizType.${appeal?.bizType}`)}</dd>
            </div>
            <div>
              <dt>{t('appeal.apply.bizCode')}</dt>
              <dd>{appeal?.bizCode}</dd>
            </div>
            <div>
              <dt>{t('appeal.apply.reason')}</dt>
              <dd>{form.getFieldValue('reason')}</dd>
            </div>
            <div>
              <dt>{t('appeal.apply.expected')}</dt>
              <dd>{form.getFieldValue('expected')}</dd>
            </div>
            <div>
              <dt>{t('appeal.apply.materialsTitle')}</dt>
              <dd>{t('appeal.apply.materialsCount', { count: materials.length })}</dd>
            </div>
            <div>
              <dt>{t('appeal.apply.draftNoLabel')}</dt>
              <dd>
                {appeal ? fmtDateTime(appeal.createdAt) : '-'} · {appeal?.code}
              </dd>
            </div>
          </dl>
        </div>
      </Modal>
    </div>
  );
}
