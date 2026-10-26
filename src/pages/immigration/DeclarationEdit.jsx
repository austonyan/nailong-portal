import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Checkbox, Form, FormItem, Input, Modal, Radio, Select, Tag, Title, useForm } from 'animal-island-ui';
import { SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { ImNav } from '../../components/immigration/shared.jsx';
import Attachments from '../../components/immigration/Attachments.jsx';
import { toastSuccess, toastWarning } from '../../components/toast.js';

const PURPOSES = ['fun', 'visit', 'business', 'show', 'other'];
const ITEM_KEYS = ['plush', 'snacks', 'stickers', 'pillow', 'balloon', 'photo_card'];

export default function DeclarationEdit() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams(); // draft id when editing
  const [searchParams] = useSearchParams();
  const fromId = searchParams.get('from');
  const [form] = useForm();

  const [ports, setPorts] = useState([]);
  const [decl, setDecl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [visaState, setVisaState] = useState(null); // { result, detail }
  const [itemKeys, setItemKeys] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [itemsError, setItemsError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [attachments, setAttachments] = useState([]);

  const applyDeclaration = useCallback(
    (d) => {
      setDecl(d);
      setVisaState(d.visaResult ? { result: d.visaResult } : null);
      setAttachments(d.attachments ?? []);
      const qty = {};
      for (const item of d.items ?? []) qty[item.key] = item.qty;
      setQuantities(qty);
      setItemKeys((d.items ?? []).map((i) => i.key));
      form.setFieldsValue({
        portCode: d.portCode,
        nickname: d.nickname,
        contact: d.contact,
        purpose: d.purpose,
        purposeNote: d.purposeNote,
        stayDays: String(d.stayDays),
        companions: String(d.companions),
        address: d.address,
        visaNo: d.visaNo ?? '',
      });
    },
    [form]
  );

  useEffect(() => {
    api
      .get('/immigration/ports')
      .then((data) => {
        const open = data.items.filter((p) => p.status === 'open');
        setPorts(open);
        if (!id && !fromId && open.length) form.setFieldValue('portCode', open[0].code);
      })
      .catch(toastApiError);
  }, [id, fromId, form]);

  useEffect(() => {
    if (id) {
      api
        .get(`/immigration/declarations/${id}`)
        .then((data) => applyDeclaration(data.declaration))
        .catch(toastApiError);
    } else if (fromId) {
      // 重新申报:预填一份旧申报的内容,但按全新草稿处理。
      api
        .get(`/immigration/declarations/${fromId}`)
        .then((data) => {
          applyDeclaration({ ...data.declaration, id: undefined, no: undefined, status: 'draft', attachments: [] });
          setDecl(null);
        })
        .catch(toastApiError);
    }
  }, [id, fromId, applyDeclaration]);

  const checkVisa = async () => {
    const visaNo = form.getFieldValue('visaNo');
    if (!visaNo) {
      toastWarning(t('imm.declare.visaFirst'));
      return;
    }
    try {
      const data = await api.post('/immigration/visa/check', { visaNo });
      setVisaState(data);
      if (data.result === 'valid') toastSuccess(t('imm.declare.visaOk'));
      else toastWarning(t(`api.IMM_VISA_${data.result.toUpperCase()}`, { defaultValue: data.result }));
    } catch (err) {
      toastApiError(err);
    }
  };

  const gatherPayload = (values) => ({
    portCode: values.portCode,
    nickname: values.nickname?.trim(),
    contact: values.contact?.trim(),
    purpose: values.purpose,
    purposeNote: values.purposeNote?.trim() ?? '',
    stayDays: Number(values.stayDays),
    companions: Number(values.companions ?? 0),
    address: values.address?.trim() ?? '',
    visaNo: values.visaNo?.trim().toUpperCase() ?? '',
    items: itemKeys.map((key) => ({ key, qty: quantities[key] ?? 1 })),
  });

  // Persist the form as a draft. Returns the saved declaration.
  const persistDraft = async () => {
    const values = await form.validateFields();
    if (itemKeys.length === 0) {
      setItemsError(true);
      return null;
    }
    setItemsError(false);
    const payload = gatherPayload(values);
    if (decl?.id) {
      const data = await api.patch(`/immigration/declarations/${decl.id}`, payload);
      setDecl(data.declaration);
      return data.declaration;
    }
    const data = await api.post('/immigration/declarations', payload);
    setDecl(data.declaration);
    return data.declaration;
  };

  const saveDraft = async () => {
    setBusy(true);
    try {
      const saved = await persistDraft();
      if (saved) {
        toastSuccess(t('imm.declare.draftSaved'));
        if (!id) navigate(`/immigration/declare/${saved.id}`, { replace: true });
      }
    } catch (err) {
      if (err?.code) toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    setBusy(true);
    try {
      const current = await persistDraft();
      if (!current) {
        setConfirming(false);
        return;
      }
      const data = await api.post(`/immigration/declarations/${current.id}/submit`, {});
      toastSuccess(t('imm.declare.submitted', { no: data.declaration.no }));
      setConfirming(false);
      navigate('/immigration/declarations');
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = async () => {
    if (itemKeys.length === 0) {
      setItemsError(true);
      return;
    }
    setItemsError(false);
    setConfirming(true);
  };

  const preview = form.getFieldsValue();
  const selectedQtyItems = itemKeys.map((key) => ({ key, qty: quantities[key] ?? 1 }));

  return (
    <div className="im-page">
      <ImNav />
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {decl?.id ? t('imm.declare.editTitle') : t('imm.declare.title')}
        </Title>
        {decl?.no && <Tag color="app-blue" variant="soft">{decl.no}</Tag>}
      </div>

      <Card>
        <Form form={form} layout="vertical" onFinish={openConfirm}>
          <FormItem name="portCode" label={t('imm.declare.port')} rules={[{ required: true }]}>
            <Select
              options={ports.map((p) => ({ key: p.code, label: `${p.name} (${p.code})` }))}
              placeholder={t('imm.declare.portPlaceholder')}
              disabled={!!decl?.id}
            />
          </FormItem>
          <FormItem name="nickname" label={t('imm.declare.nickname')} rules={[{ required: true, message: t('imm.declare.required') }]}>
            <Input size="large" placeholder={t('imm.declare.nicknamePlaceholder')} allowClear maxLength={40} />
          </FormItem>
          <FormItem name="contact" label={t('imm.declare.contact')} rules={[{ required: true, message: t('imm.declare.required') }]}>
            <Input size="large" placeholder={t('imm.declare.contactPlaceholder')} allowClear maxLength={60} />
          </FormItem>
          <FormItem name="purpose" label={t('imm.declare.purpose')} rules={[{ required: true }]}>
            <Radio options={PURPOSES.map((p) => ({ label: t(`imm.purpose.${p}`), value: p }))} direction="horizontal" />
          </FormItem>
          <FormItem name="purposeNote" label={`${t('imm.declare.purposeNote')}(${t('common.optional')})`}>
            <Input size="large" maxLength={200} placeholder={t('imm.declare.purposeNotePlaceholder')} />
          </FormItem>
          <div className="im-form-row">
            <FormItem name="stayDays" label={t('imm.declare.stayDays')} rules={[{ required: true, message: t('imm.declare.required') }]}>
              <Input size="large" type="number" min={1} max={90} placeholder="1-90" />
            </FormItem>
            <FormItem name="companions" label={t('imm.declare.companions')}>
              <Input size="large" type="number" min={0} max={20} placeholder="0" />
            </FormItem>
          </div>
          <FormItem name="address" label={`${t('imm.declare.address')}(${t('common.optional')})`}>
            <Input size="large" maxLength={120} placeholder={t('imm.declare.addressPlaceholder')} />
          </FormItem>

          <FormItem
            name="visaNo"
            label={t('imm.declare.visaNo')}
            rules={[{ required: true, message: t('imm.declare.required') }]}
            help={t('imm.declare.visaTip')}
          >
            <Input
              size="large"
              placeholder="NL-1234-ABCD"
              allowClear
              suffix={
                <Button type="text" size="small" icon={<SearchIcon />} onClick={checkVisa}>
                  {t('imm.declare.checkVisa')}
                </Button>
              }
            />
          </FormItem>
          {visaState && (
            <div className="im-visa-result">
              {visaState.result === 'valid' ? (
                <Tag color="app-green" variant="solid">
                  {t('imm.visaResult.valid')} · {visaState.detail?.type} · {t('imm.visaResult.validUntil', { date: visaState.detail?.validUntil })}
                </Tag>
              ) : (
                <Tag color="app-red" variant="soft">{t(`imm.visaResult.${visaState.result}`, { defaultValue: visaState.result })}</Tag>
              )}
            </div>
          )}

          <FormItem
            label={t('imm.declare.items')}
            validateStatus={itemsError ? 'error' : ''}
            help={itemsError ? t('imm.declare.itemsRequired') : t('imm.declare.itemsTip')}
          >
            <Checkbox options={ITEM_KEYS.map((k) => ({ label: t(`imm.item.${k}`), value: k }))} value={itemKeys} onChange={setItemKeys} direction="horizontal" />
          </FormItem>
          {itemKeys.length > 0 && (
            <div className="im-item-qty">
              {itemKeys.map((key) => (
                <label key={key} className="im-item-qty-row">
                  <span>{t(`imm.item.${key}`)}</span>
                  <Input
                    size="small"
                    type="number"
                    min={1}
                    max={99}
                    value={String(quantities[key] ?? 1)}
                    onChange={(e) => setQuantities((q) => ({ ...q, [key]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) }))}
                  />
                </label>
              ))}
            </div>
          )}

          <FormItem>
            <div className="im-form-actions">
              <Button type="default" size="large" loading={busy} onClick={saveDraft} disabled={busy}>
                {t('imm.declare.saveDraft')}
              </Button>
              <Button type="primary" size="large" htmlType="submit">
                {t('imm.declare.nextConfirm')}
              </Button>
            </div>
          </FormItem>
        </Form>
      </Card>

      {decl?.id && (
        <Card className="im-decl-attachments">
          <b>{t('imm.attachments.title')}</b>
          <Attachments
            declarationId={decl.id}
            attachments={attachments}
            canUpload
            onChanged={(att) => {
              setAttachments((list) => (att.removed ? list.filter((a) => a.id !== att.id) : [...list, att]));
            }}
          />
        </Card>
      )}

      <Modal
        open={confirming}
        title={t('imm.declare.confirmTitle')}
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={doSubmit} disabled={busy}>
              {t('imm.declare.submit')}
            </Button>
          </>
        }
        width={560}
        typewriter={false}
      >
        <div className="im-confirm-list">
          <p><b>{t('imm.declare.port')}:</b> {preview.portCode}</p>
          <p><b>{t('imm.declare.nickname')}:</b> {preview.nickname}</p>
          <p><b>{t('imm.declare.contact')}:</b> {preview.contact}</p>
          <p><b>{t('imm.declare.purpose')}:</b> {t(`imm.purpose.${preview.purpose ?? 'fun'}`)}{preview.purposeNote ? ` (${preview.purposeNote})` : ''}</p>
          <p><b>{t('imm.declare.stayDays')}:</b> {preview.stayDays}</p>
          <p><b>{t('imm.declare.companions')}:</b> {preview.companions ?? 0}</p>
          <p><b>{t('imm.declare.address')}:</b> {preview.address || '-'}</p>
          <p><b>{t('imm.declare.visaNo')}:</b> {preview.visaNo}</p>
          <p><b>{t('imm.declare.items')}:</b> {selectedQtyItems.map((i) => `${t(`imm.item.${i.key}`)} x${i.qty}`).join(', ') || '-'}</p>
        </div>
      </Modal>
    </div>
  );
}
