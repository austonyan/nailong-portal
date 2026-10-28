// 变更与续期:信息变更、居民类型升级、到期续期的申请与记录。
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Form, FormItem, Input, Modal, Select, Tabs, Tag, Title, useForm } from 'animal-island-ui';
import { SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { useConfirmAction } from '../../components/ConfirmAction.jsx';
import { CHANGE_TYPES, StatusTag, TextArea, fmtDateTime, toastResError, toastResSuccess } from './shared.jsx';

const CHANGE_STATUS_COLORS = {
  pending_review: 'app-yellow',
  approved: 'app-green',
  rejected: 'app-red',
  cancelled: 'default',
};

export default function ResidentChanges() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [form] = useForm();
  const [items, setItems] = useState(null);
  const [card, setCard] = useState(null);
  const [types, setTypes] = useState([]);
  const [changeType, setChangeType] = useState(searchParams.get('type') || 'info');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cardMissing, setCardMissing] = useState(false);
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(async () => {
    try {
      const data = await api.get('/resident/card');
      setCard(data.card);
    } catch (err) {
      if (err?.status === 404) setCardMissing(true);
      else toastResError(t, err);
    }
    try {
      const data = await api.get('/resident/changes');
      setItems(data.items);
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (changeType !== 'upgrade') return;
    api
      .get('/resident/types')
      .then((data) => setTypes(data.items))
      .catch(() => setTypes([]));
  }, [changeType]);

  if (cardMissing) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('res.changes.needCard')}</p>
      </Card>
    );
  }

  const openConfirm = async () => {
    try {
      await form.validateFields();
      setConfirmOpen(true);
    } catch {
      // 校验失败,FormItem 已显示
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const values = await form.validateFields();
      const body = { type: changeType };
      if (changeType === 'info') {
        if (values.contact) body.contact = values.contact;
        if (values.virtualAddress) body.virtualAddress = values.virtualAddress;
        if (values.bio) body.bio = values.bio;
      } else if (changeType === 'upgrade') {
        body.targetTypeCode = values.targetTypeCode;
        body.note = values.note || '';
      }
      await api.post('/resident/changes', body);
      setConfirmOpen(false);
      form.resetFields();
      toastResSuccess(t('res.changes.submitted'));
      await load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const askCancel = (row) => confirm({
    title: t('res.changes.cancelTitle'),
    tip: t('res.changes.cancelConfirm', { no: row.no }),
    confirmText: t('res.changes.cancel'),
    action: () => api.post(`/resident/changes/${row.id}/cancel`),
    success: t('res.changes.cancelled'),
    onDone: load,
    onError: (err) => toastResError(t, err),
  });

  return (
    <div className="res-changes-page">
      <div className="page-header">
        <Title size="middle" color="app-green">
          {t('res.changes.title')}
        </Title>
      </div>

      <Card className="res-form-card">
        <h4>{t('res.changes.newTitle')}</h4>
        <Tabs
          activeKey={changeType}
          onChange={(key) => setChangeType(key)}
          items={CHANGE_TYPES.map((type) => ({
            key: type,
            label: t(`res.changeType.${type}`),
            children: (
              <div className="res-change-tab">
                <p className="muted-text">{t(`res.changes.${type}Tip`)}</p>
                {type === 'info' && (
                  <Form form={form} layout="vertical">
                    <FormItem name="contact" label={t('res.form.contact')}>
                      <Input size="large" allowClear maxLength={100} placeholder={t('res.changes.keepIfEmpty')} />
                    </FormItem>
                    <FormItem name="virtualAddress" label={t('res.form.virtualAddress')}>
                      <Input size="large" allowClear maxLength={200} placeholder={t('res.changes.keepIfEmpty')} />
                    </FormItem>
                    <FormItem name="bio" label={t('res.form.bio')}>
                      <TextArea maxLength={500} placeholder={t('res.changes.keepIfEmpty')} />
                    </FormItem>
                  </Form>
                )}
                {type === 'upgrade' && (
                  <Form form={form} layout="vertical">
                    <FormItem name="targetTypeCode" label={t('res.changes.targetType')} rules={[{ required: true, message: t('res.changes.targetType') }]}>
                      <Select
                        placeholder={t('res.changes.targetTypePlaceholder')}
                        options={types
                          .filter((item) => item.code !== card?.typeCode)
                          .map((item) => ({ label: `${item.name} · ${t('res.type.validYears', { years: item.validYears })}`, value: item.code }))}
                        value={form.getFieldValue('targetTypeCode')}
                        onChange={(v) => form.setFieldsValue({ targetTypeCode: v })}
                      />
                    </FormItem>
                    <FormItem name="note" label={`${t('res.changes.upgradeNote')}(${t('common.optional')})`}>
                      <TextArea maxLength={300} placeholder={t('res.changes.upgradeNotePlaceholder')} />
                    </FormItem>
                  </Form>
                )}
                {type === 'renewal' && (
                  <p className="muted-text">
                    {t('res.changes.renewalExplain', { until: card ? fmtDateTime(card.validUntil).slice(0, 10) : '-' })}
                  </p>
                )}
              </div>
            ),
          }))}
        />

        <Button type="primary" icon={<SendIcon />} loading={busy} onClick={openConfirm} disabled={busy}>
          {t('res.changes.submit')}
        </Button>
      </Card>

      <Card className="res-info-card">
        <h4>{t('res.changes.recordsTitle')}</h4>
        {items === null ? (
          <p className="muted-text">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="muted-text">{t('res.changes.empty')}</p>
        ) : (
          <div className="res-change-list">
            {items.map((row) => (
              <div key={row.id} className="res-change-item">
                <div className="res-change-item-head">
                  <b>{row.no}</b>
                  <Tag variant="soft" color="app-teal" size="small">
                    {t(`res.changeType.${row.type}`)}
                  </Tag>
                  <StatusTag value={row.status} map={CHANGE_STATUS_COLORS} i18nPrefix="res.changeStatus" />
                  <span className="muted-text">{fmtDateTime(row.createdAt)}</span>
                  {row.status === 'pending_review' && (
                    <Button type="text" size="small" danger onClick={() => askCancel(row)}>
                      {t('res.changes.cancel')}
                    </Button>
                  )}
                </div>
                <p className="muted-text">{changeSummary(t, row)}</p>
                {row.status === 'rejected' && (
                  <p className="res-change-reject">
                    {t('res.changes.rejectReason')}: {t(`res.rejectReason.${row.rejectCode || 'other'}`)}
                    {row.rejectNote ? ` · ${row.rejectNote}` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        maskClosable={false}
        open={confirmOpen}
        title={t('res.changes.confirmTitle')}
        onClose={() => {
          if (busy) return;
          setConfirmOpen(false);
        }}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)} disabled={busy}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={submit} disabled={busy}>
              {t('res.changes.submit')}
            </Button>
          </>
        }
      >
        <p>{t(`res.changes.${changeType}Confirm`)}</p>
        <p className="muted-text">{t('res.changes.confirmAudit')}</p>
      </Modal>
      {dialog}
    </div>
  );
}

function changeSummary(t, row) {
  if (row.type === 'info') {
    const parts = [];
    if (row.payload?.contact !== undefined) parts.push(`${t('res.form.contact')}: ${row.payload.contact || '-'}`);
    if (row.payload?.virtualAddress !== undefined) parts.push(`${t('res.form.virtualAddress')}: ${row.payload.virtualAddress || '-'}`);
    if (row.payload?.bio !== undefined) parts.push(`${t('res.form.bio')}: ${row.payload.bio || '-'}`);
    return parts.join(' · ') || '-';
  }
  if (row.type === 'upgrade') {
    return `${t('res.changes.targetType')}: ${row.payload?.targetTypeName || row.payload?.targetTypeCode || '-'}`;
  }
  return t('res.changes.renewalExplainShort');
}
