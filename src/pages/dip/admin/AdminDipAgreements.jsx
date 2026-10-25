// 互免协议管理: 创建 / 编辑 / 生效 / 终止 / 公示开关。协议变更全部审计。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, Form, FormItem, Input, Modal, Notification, Select, Table, Tag, Title, useForm } from 'animal-island-ui';
import { PlusIcon } from 'naive-icons';
import dayjs from 'dayjs';
import { api } from '../../../api/client.js';
import { DipAdminNav, StatusTag, TextArea, fmtDateTime, toastDipError } from '../../../components/dip/shared.jsx';

const TYPES = ['entry_courtesy', 'visa_waiver', 'event_pass'];

function AgreementModal({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form] = useForm();
  const [busy, setBusy] = useState(false);
  const editing = !!initial?.id;
  const [published, setPublished] = useState(!!initial?.published);

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        partyA: initial.partyA,
        partyB: initial.partyB,
        type: initial.type ?? 'entry_courtesy',
        courtesies: initial.courtesies,
        coveredScope: initial.coveredScope,
        effectiveFrom: (initial.effectiveFrom ?? '').slice(0, 10),
        effectiveTo: (initial.effectiveTo ?? '').slice(0, 10),
        note: initial.note,
      });
      setPublished(!!initial.published);
    }
  }, [initial, form]);

  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const payload = {
        ...values,
        courtesies: values.courtesies?.trim() ?? '',
        coveredScope: values.coveredScope?.trim() ?? '',
        note: values.note?.trim() ?? '',
        published,
      };
      if (editing) await api.patch(`/dip/admin/agreements/${initial.id}`, payload);
      else await api.post('/dip/admin/agreements', payload);
      Notification.success(t('common.save'));
      onSaved();
      onClose();
    } catch (err) {
      toastDipError(t, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={editing ? t('dip.agreement.editTitle', { no: initial.no }) : t('dip.agreement.createTitle')}
      onClose={onClose}
      typewriter={false}
      width={560}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <Form form={form} layout="vertical">
        <div className="dip-form-row">
          <FormItem name="partyA" label={t('dip.agreement.partyA')} rules={[{ required: true }]}>
            <Input maxLength={60} placeholder={t('dip.agreement.partyPlaceholder')} />
          </FormItem>
          <FormItem name="partyB" label={t('dip.agreement.partyB')} rules={[{ required: true }]}>
            <Input maxLength={60} placeholder={t('dip.agreement.partyPlaceholder')} />
          </FormItem>
        </div>
        <FormItem name="type" label={t('dip.agreement.type')} rules={[{ required: true }]}>
          <Select options={TYPES.map((x) => ({ key: x, label: t(`dip.agreementType.${x}`) }))} />
        </FormItem>
        <div className="dip-form-row">
          <FormItem name="effectiveFrom" label={t('dip.agreement.effectiveFrom')} rules={[{ required: true }]}>
            <Input type="date" />
          </FormItem>
          <FormItem name="effectiveTo" label={t('dip.agreement.effectiveTo')} rules={[{ required: true }]}>
            <Input type="date" />
          </FormItem>
        </div>
        <FormItem name="courtesies" label={t('dip.agreement.courtesies')}>
          <TextArea rows={2} maxLength={500} placeholder={t('dip.agreement.courtesiesTip')} />
        </FormItem>
        <FormItem name="coveredScope" label={t('dip.agreement.scope')}>
          <Input maxLength={300} placeholder={t('dip.agreement.scopeTip')} />
        </FormItem>
        <FormItem name="note" label={t('dip.agreement.note')}>
          <Input maxLength={300} />
        </FormItem>
        <FormItem>
          <Checkbox
            options={[{ label: t('dip.agreement.published'), value: 'yes' }]}
            value={published ? ['yes'] : []}
            onChange={(vals) => setPublished(vals.includes('yes'))}
          />
        </FormItem>
      </Form>
    </Modal>
  );
}

export default function AdminDipAgreements() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null); // null | {} | row

  const load = useCallback(() => {
    api
      .get('/dip/admin/agreements?pageSize=100')
      .then((data) => setItems(data.items))
      .catch((err) => {
        toastDipError(t, err);
        setItems([]);
      });
  }, [t]);

  useEffect(load, [load]);

  const setStatus = async (row, status) => {
    try {
      await api.post(`/dip/admin/agreements/${row.id}/status`, { status });
      Notification.success(t('common.save'));
      load();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const columns = [
    { title: t('dip.agreement.no'), dataIndex: 'no', width: 190 },
    { title: t('dip.agreement.parties'), width: 200, render: (_, r) => `${r.partyA} × ${r.partyB}` },
    { title: t('dip.agreement.type'), dataIndex: 'type', width: 110, render: (v) => t(`dip.agreementType.${v}`, { defaultValue: v }) },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} /> },
    {
      title: t('dip.agreement.validRange', { from: '', to: '' }),
      width: 190,
      render: (_, r) => `${(r.effectiveFrom ?? '').slice(0, 10)} ~ ${(r.effectiveTo ?? '').slice(0, 10)}`,
    },
    {
      title: t('dip.agreement.published'),
      dataIndex: 'published',
      width: 80,
      render: (v) => (v ? <Tag color="app-green" variant="soft">{t('dip.agreement.published')}</Tag> : <Tag>{t('dip.agreement.unpublished')}</Tag>),
    },
    { title: t('dip.agreement.updatedAt'), dataIndex: 'updatedAt', width: 150, render: (v) => fmtDateTime(v) },
    {
      title: t('common.actions'),
      width: 260,
      render: (_, r) => (
        <div className="table-actions">
          {['draft', 'pending_effect'].includes(r.status) && (
            <Button type="primary" size="small" onClick={() => setStatus(r, 'active')}>{t('dip.agreement.effect')}</Button>
          )}
          {['active', 'pending_effect', 'draft'].includes(r.status) && (
            <Button type="default" size="small" danger onClick={() => setStatus(r, 'terminated')}>{t('dip.agreement.terminate')}</Button>
          )}
          {r.status !== 'terminated' && r.status !== 'expired' && (
            <Button size="small" onClick={() => setModal(r)}>{t('common.edit')}</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="dip-page">
      <DipAdminNav />
      <div className="page-header">
        <Title size="middle" color="purple">{t('dip.agreement.adminTitle')}</Title>
        <Button type="primary" icon={<PlusIcon />} onClick={() => setModal({ effectiveFrom: dayjs().format('YYYY-MM-DD') })}>
          {t('dip.agreement.create')}
        </Button>
      </div>
      <Card>
        <Table columns={columns} dataSource={items ?? []} loading={items === null} rowKey="id" pagination={{ defaultPageSize: 10, showTotal: true }} />
      </Card>
      {modal !== null && <AgreementModal initial={modal} onClose={() => setModal(null)} onSaved={load} />}
    </div>
  );
}
