// 建交申请: 类型选择 → 信息表单 → 材料 → 确认 → 提交。
// 支持草稿保存/编辑,支持 ?from=<id> 预填重新申请。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Checkbox, Form, FormItem, Input, Modal, Radio, Select, Tag, Title, useForm } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { DipNav, TextArea, toastDipError } from '../../components/dip/shared.jsx';
import DipMaterials from '../../components/dip/DipMaterials.jsx';
import { toastSuccess } from '../../components/toast.js';

const PURPOSES = ['display', 'cooperation', 'visa_channel'];

export default function DipApply() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams(); // draft id when editing
  const [searchParams] = useSearchParams();
  const fromId = searchParams.get('from');
  const [form] = useForm();

  const [catalog, setCatalog] = useState({ objectTypes: [], relationTypes: [], courtesyTypes: [] });
  const [decl, setDecl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [courtesies, setCourtesies] = useState([]);
  const [materials, setMaterials] = useState([]);

  const loadCatalog = useCallback(() => {
    api
      .get('/dip/overview')
      .then((data) =>
        setCatalog({
          objectTypes: data.objectTypes ?? [],
          relationTypes: data.relationTypes ?? [],
          courtesyTypes: data.courtesyTypes ?? [],
        })
      )
      .catch((err) => toastDipError(t, err));
  }, [t]);

  useEffect(loadCatalog, [loadCatalog]);

  const applyRelation = useCallback(
    (r) => {
      setDecl(r);
      setMaterials(r.materials ?? []);
      setCourtesies(r.courtesies ?? []);
      form.setFieldsValue({
        objectType: r.objectType,
        relationType: r.relationType,
        entityName: r.entityName,
        repNickname: r.repNickname,
        contact: r.contact,
        reason: r.reason,
        purpose: r.purpose,
      });
    },
    [form]
  );

  useEffect(() => {
    if (id) {
      api
        .get(`/dip/relations/${id}`)
        .then((data) => applyRelation(data.relation))
        .catch((err) => toastDipError(t, err));
    } else if (fromId) {
      // 重新申请:预填旧申请内容,但按全新草稿处理。
      api
        .get(`/dip/relations/${fromId}`)
        .then((data) => {
          applyRelation({ ...data.relation, id: undefined, no: undefined, status: 'draft', materials: [] });
          setDecl(null);
        })
        .catch((err) => toastDipError(t, err));
    } else {
      form.setFieldValue('purpose', 'display');
    }
  }, [id, fromId, applyRelation, form, t]);

  const gatherPayload = (values) => ({
    objectType: values.objectType,
    relationType: values.relationType,
    entityName: values.entityName?.trim(),
    repNickname: values.repNickname?.trim(),
    contact: values.contact?.trim(),
    reason: values.reason?.trim() ?? '',
    purpose: values.purpose,
    courtesies,
  });

  const persistDraft = async () => {
    const values = await form.validateFields();
    const payload = gatherPayload(values);
    if (decl?.id) {
      const data = await api.patch(`/dip/relations/${decl.id}`, payload);
      setDecl(data.relation);
      return data.relation;
    }
    const data = await api.post('/dip/relations', payload);
    setDecl(data.relation);
    return data.relation;
  };

  const saveDraft = async () => {
    setBusy(true);
    try {
      const saved = await persistDraft();
      toastSuccess(t('dip.apply.draftSaved'));
      if (!id && saved) navigate(`/dip/apply/${saved.id}`, { replace: true });
    } catch (err) {
      if (err?.code) toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    setBusy(true);
    try {
      const current = await persistDraft();
      const data = await api.post(`/dip/relations/${current.id}/submit`, {});
      toastSuccess(t('dip.apply.submitted', { no: data.relation.no }));
      setConfirming(false);
      navigate('/dip/relations');
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = () => {
    setConfirming(true);
  };

  const preview = form.getFieldsValue();
  const selectedRelationType = catalog.relationTypes.find((r) => r.code === preview.relationType);

  return (
    <div className="dip-page">
      <DipNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="purple">
            {decl?.id ? t('dip.apply.editTitle') : t('dip.apply.title')}
          </Title>
        </h1>
        {decl?.no && <Tag color="app-blue" variant="soft">{decl.no}</Tag>}
      </div>

      <Card>
        <Form form={form} layout="vertical" onFinish={openConfirm}>
          <div className="dip-form-row">
            <FormItem name="objectType" label={t('dip.apply.objectType')} rules={[{ required: true, message: t('dip.apply.required') }]}>
              <Select
                options={catalog.objectTypes.map((o) => ({ key: o.code, label: `${o.name}(${t('dip.apply.open')})` }))}
                placeholder={t('dip.apply.objectTypePlaceholder')}
              />
            </FormItem>
            <FormItem name="relationType" label={t('dip.apply.relationType')} rules={[{ required: true, message: t('dip.apply.required') }]}>
              <Select
                options={catalog.relationTypes.map((r) => ({ key: r.code, label: `${r.name}(${t('dip.apply.open')})` }))}
                placeholder={t('dip.apply.relationTypePlaceholder')}
              />
            </FormItem>
          </div>
          {selectedRelationType?.guide && (
            <p className="dip-type-guide muted-text">{selectedRelationType.guide}</p>
          )}
          <FormItem name="entityName" label={t('dip.apply.entityName')} rules={[{ required: true, message: t('dip.apply.required') }]}>
            <Input size="large" placeholder={t('dip.apply.entityNamePlaceholder')} allowClear maxLength={60} />
          </FormItem>
          <div className="dip-form-row">
            <FormItem name="repNickname" label={t('dip.apply.repNickname')} rules={[{ required: true, message: t('dip.apply.required') }]}>
              <Input size="large" placeholder={t('dip.apply.repNicknamePlaceholder')} allowClear maxLength={40} />
            </FormItem>
            <FormItem name="contact" label={t('dip.apply.contact')} rules={[{ required: true, message: t('dip.apply.required') }]}>
              <Input size="large" placeholder={t('dip.apply.contactPlaceholder')} allowClear maxLength={60} />
            </FormItem>
          </div>
          <FormItem name="reason" label={t('dip.apply.reason')} rules={[{ required: true, message: t('dip.apply.required') }]}>
            <TextArea rows={4} maxLength={500} placeholder={t('dip.apply.reasonPlaceholder')} />
          </FormItem>
          <FormItem name="purpose" label={t('dip.apply.purpose')} rules={[{ required: true }]}>
            <Radio options={PURPOSES.map((p) => ({ label: t(`dip.purpose.${p}`), value: p }))} direction="horizontal" />
          </FormItem>
          <FormItem label={t('dip.apply.courtesies')} help={t('dip.apply.courtesiesTip')}>
            <Checkbox
              options={catalog.courtesyTypes.map((c) => ({ label: c.name, value: c.code }))}
              value={courtesies}
              onChange={setCourtesies}
              direction="horizontal"
            />
          </FormItem>

          <FormItem>
            <div className="dip-form-actions">
              <Button type="default" size="large" loading={busy} onClick={saveDraft} disabled={busy}>
                {t('dip.apply.saveDraft')}
              </Button>
              <Button type="primary" size="large" htmlType="submit">
                {t('dip.apply.nextConfirm')}
              </Button>
            </div>
          </FormItem>
        </Form>
      </Card>

      {decl?.id && (
        <Card className="dip-apply-materials">
          <b>{t('dip.material.title')}</b>
          <p className="muted-text">{t('dip.material.tip')}</p>
          <DipMaterials
            ownerType="relation"
            ownerId={decl.id}
            materials={materials}
            canUpload
            onChanged={(mat) => {
              setMaterials((list) => (mat.removed ? list.filter((m) => m.id !== mat.id) : [...list, mat]));
            }}
          />
        </Card>
      )}

      <Modal
        maskClosable={false}
        open={confirming}
        title={t('dip.apply.confirmTitle')}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={doSubmit} disabled={busy}>
              {t('dip.apply.submit')}
            </Button>
          </>
        }
        width={560}
        typewriter={false}
      >
        <div className="dip-confirm-list">
          <p><b>{t('dip.apply.objectType')}:</b> {t(`dip.objectType.${preview.objectType}`, { defaultValue: preview.objectType })}</p>
          <p><b>{t('dip.apply.relationType')}:</b> {t(`dip.relationType.${preview.relationType}`, { defaultValue: preview.relationType })}</p>
          <p><b>{t('dip.apply.entityName')}:</b> {preview.entityName}</p>
          <p><b>{t('dip.apply.repNickname')}:</b> {preview.repNickname}</p>
          <p><b>{t('dip.apply.contact')}:</b> {preview.contact}</p>
          <p><b>{t('dip.apply.reason')}:</b> {preview.reason}</p>
          <p><b>{t('dip.apply.purpose')}:</b> {t(`dip.purpose.${preview.purpose ?? 'display'}`)}</p>
          <p><b>{t('dip.apply.courtesies')}:</b> {(courtesies.length ? courtesies.map((c) => t(`dip.courtesy.${c}`, { defaultValue: c })).join('、') : '-')}</p>
          <p><b>{t('dip.material.title')}:</b> {t('dip.apply.materialCount', { count: materials.length })}</p>
        </div>
      </Modal>
    </div>
  );
}
