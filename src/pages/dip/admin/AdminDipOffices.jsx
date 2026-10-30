// 虚构代表处管理: 代表处 CRUD / 状态(开放·关闭·维护) / 公告发布编辑下线。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Form, FormItem, Input, Modal, Select, Table, Tag, Title, useForm } from 'animal-island-ui';
import { PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { DipAdminNav, StatusTag, TextArea, fmtDateTime, toastDipError } from '../../../components/dip/shared.jsx';
import { toastSuccess } from '../../../components/toast.js';

function OfficeModal({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form] = useForm();
  const [busy, setBusy] = useState(false);
  const editing = !!initial?.id;

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        code: initial.code,
        name: initial.nameCn ?? initial.name,
        nameTw: initial.nameTw ?? '',
        location: initial.locationCn ?? initial.location,
        locationTw: initial.locationTw ?? '',
        openHours: initial.openHoursCn ?? initial.openHours,
        openHoursTw: initial.openHoursTw ?? '',
        intro: initial.introCn ?? initial.intro,
        introTw: initial.introTw ?? '',
        contact: initial.contactCn ?? initial.contact,
        contactTw: initial.contactTw ?? '',
        services: initial.servicesCn ?? initial.services,
        servicesTw: initial.servicesTw ?? '',
      });
    }
  }, [initial, form]);

  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const payload = {
        ...values,
        intro: values.intro?.trim() ?? '',
        contact: values.contact?.trim() ?? '',
        services: values.services?.trim() ?? '',
      };
      if (editing) await api.patch(`/dip/admin/offices/${initial.id}`, payload);
      else await api.post('/dip/admin/offices', payload);
      toastSuccess(t('common.save'));
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
      maskClosable={false}
      open
      title={editing ? t('dip.office.editTitle', { name: initial.name }) : t('dip.office.createTitle')}
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
          <FormItem name="code" label={t('dip.office.code')} rules={[{ required: true, message: t('common.required') }]} help={t('dip.office.codeTip')}>
            <Input maxLength={20} disabled={editing} placeholder="OFC_CENTRAL" />
          </FormItem>
          <FormItem name="name" label={t('dip.office.name')} rules={[{ required: true, message: t('common.required') }]}>
            <Input maxLength={40} placeholder={t('dip.office.namePlaceholder')} />
          </FormItem>
          <FormItem name="nameTw" label={`${t('dip.office.name')} · ${t('common.traditional')}`}>
            <Input maxLength={40} placeholder={t('common.twOptional')} />
          </FormItem>
        </div>
        <FormItem name="location" label={t('dip.office.location')}>
          <Input maxLength={80} placeholder={t('dip.office.locationPlaceholder')} />
        </FormItem>
        <FormItem name="locationTw" label={`${t('dip.office.location')} · ${t('common.traditional')}`}>
          <Input maxLength={80} placeholder={t('common.twOptional')} />
        </FormItem>
        <FormItem name="openHours" label={t('dip.office.hours')}>
          <Input maxLength={80} placeholder={t('dip.office.hoursPlaceholder')} />
        </FormItem>
        <FormItem name="openHoursTw" label={`${t('dip.office.hours')} · ${t('common.traditional')}`}>
          <Input maxLength={80} placeholder={t('common.twOptional')} />
        </FormItem>
        <FormItem name="intro" label={t('dip.office.intro')}>
          <TextArea rows={3} maxLength={500} />
        </FormItem>
        <FormItem name="introTw" label={`${t('dip.office.intro')} · ${t('common.traditional')}`}>
          <TextArea rows={3} maxLength={500} placeholder={t('common.twOptional')} />
        </FormItem>
        <FormItem name="contact" label={t('dip.office.contact')}>
          <Input maxLength={200} placeholder={t('dip.office.contactPlaceholder')} />
        </FormItem>
        <FormItem name="contactTw" label={`${t('dip.office.contact')} · ${t('common.traditional')}`}>
          <Input maxLength={200} placeholder={t('common.twOptional')} />
        </FormItem>
        <FormItem name="services" label={t('dip.office.services')}>
          <Input maxLength={300} />
        </FormItem>
        <FormItem name="servicesTw" label={`${t('dip.office.services')} · ${t('common.traditional')}`}>
          <Input maxLength={300} placeholder={t('common.twOptional')} />
        </FormItem>
      </Form>
    </Modal>
  );
}

function NoticeModal({ initial, offices, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form] = useForm();
  const [busy, setBusy] = useState(false);
  const editing = !!initial?.id;

  useEffect(() => {
    if (initial) {
      form.setFieldsValue({
        title: initial.titleCn ?? initial.title,
        titleTw: initial.titleTw ?? '',
        body: initial.bodyCn ?? initial.body,
        bodyTw: initial.bodyTw ?? '',
        level: initial.level ?? 'info',
        officeId: initial.officeId ? String(initial.officeId) : '',
      });
    }
  }, [initial, form]);

  const save = async () => {
    const values = await form.validateFields();
    setBusy(true);
    try {
      const payload = { title: values.title, titleTw: values.titleTw, body: values.body, bodyTw: values.bodyTw, level: values.level, officeId: values.officeId ? Number(values.officeId) : null };
      if (editing) await api.patch(`/dip/admin/notices/${initial.id}`, payload);
      else await api.post('/dip/admin/notices', payload);
      toastSuccess(t('common.save'));
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
      maskClosable={false}
      open
      title={editing ? t('dip.admin.notice.editTitle') : t('dip.admin.notice.createTitle')}
      onClose={onClose}
      typewriter={false}
      width={520}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={save}>{t('common.save')}</Button>
        </>
      }
    >
      <Form form={form} layout="vertical">
        <FormItem name="title" label={t('dip.admin.notice.title')} rules={[{ required: true, message: t('common.required') }]}>
          <Input maxLength={80} />
        </FormItem>
        <FormItem name="titleTw" label={`${t('dip.admin.notice.title')} · ${t('common.traditional')}`}>
          <Input maxLength={80} placeholder={t('common.twOptional')} />
        </FormItem>
        <FormItem name="body" label={t('dip.admin.notice.body')} rules={[{ required: true, message: t('common.required') }]}>
          <TextArea rows={4} maxLength={1000} />
        </FormItem>
        <FormItem name="bodyTw" label={`${t('dip.admin.notice.body')} · ${t('common.traditional')}`}>
          <TextArea rows={4} maxLength={1000} placeholder={t('common.twOptional')} />
        </FormItem>
        <div className="dip-form-row">
          <FormItem name="level" label={t('dip.admin.notice.level')}>
            <Select options={['info', 'warning', 'critical'].map((l) => ({ key: l, label: t(`dip.level.${l}`) }))} />
          </FormItem>
          <FormItem name="officeId" label={t('dip.admin.notice.office')} help={t('dip.admin.notice.officeTip')}>
            <Select
              options={[{ key: '', label: t('dip.admin.notice.officeAll') }, ...offices.map((o) => ({ key: String(o.id), label: o.name }))]}
            />
          </FormItem>
        </div>
      </Form>
    </Modal>
  );
}

export default function AdminDipOffices() {
  const { t } = useTranslation();
  const [offices, setOffices] = useState(null);
  const [notices, setNotices] = useState(null);
  const [officeModal, setOfficeModal] = useState(null);
  const [noticeModal, setNoticeModal] = useState(null);

  const load = useCallback(() => {
    api
      .get('/dip/admin/offices')
      .then((data) => setOffices(data.items))
      .catch((err) => {
        toastDipError(t, err);
        setOffices([]);
      });
    api
      .get('/dip/admin/notices')
      .then((data) => setNotices(data.items))
      .catch((err) => {
        toastDipError(t, err);
        setNotices([]);
      });
  }, [t]);

  useEffect(load, [load]);

  const setOfficeStatus = async (row, status) => {
    try {
      await api.post(`/dip/admin/offices/${row.id}/status`, { status });
      toastSuccess(t('common.save'));
      load();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const offlineNotice = async (row) => {
    try {
      await api.post(`/dip/admin/notices/${row.id}/offline`);
      toastSuccess(t('common.saved'));
      load();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const deleteNotice = async (row) => {
    try {
      await api.del(`/dip/admin/notices/${row.id}`);
      toastSuccess(t('common.deleted'));
      load();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const officeColumns = [
    { title: t('dip.office.code'), dataIndex: 'code', width: 130 },
    { title: t('dip.office.name'), dataIndex: 'name', width: 150 },
    { title: t('dip.office.location'), dataIndex: 'location', width: 170 },
    { title: t('common.status'), dataIndex: 'status', width: 100, render: (v) => <StatusTag value={v} /> },
    {
      title: t('common.actions'),
      width: 280,
      render: (_, r) => (
        <div className="table-actions">
          <Button size="small" onClick={() => setOfficeModal(r)}>{t('common.edit')}</Button>
          {r.status !== 'open' && <Button type="primary" size="small" onClick={() => setOfficeStatus(r, 'open')}>{t('dip.office.open')}</Button>}
          {r.status !== 'maintenance' && <Button size="small" onClick={() => setOfficeStatus(r, 'maintenance')}>{t('dip.office.maintenance')}</Button>}
          {r.status !== 'closed' && <Button type="default" size="small" danger onClick={() => setOfficeStatus(r, 'closed')}>{t('dip.office.close')}</Button>}
        </div>
      ),
    },
  ];

  const noticeColumns = [
    { title: t('dip.admin.notice.title'), dataIndex: 'title', width: 200 },
    { title: t('dip.admin.notice.office'), dataIndex: 'officeName', width: 130, render: (v) => v || t('dip.admin.notice.officeAll') },
    { title: t('dip.admin.notice.level'), dataIndex: 'level', width: 90, render: (v) => t(`dip.level.${v}`) },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 90,
      render: (v) => (v === 'published' ? <Tag color="app-green" variant="soft">{t('dip.admin.notice.published')}</Tag> : <Tag color="brown" variant="soft">{t('dip.admin.notice.offline')}</Tag>),
    },
    { title: t('dip.admin.notice.publishedAt'), dataIndex: 'publishedAt', width: 150, render: (v) => fmtDateTime(v) },
    {
      title: t('common.actions'),
      width: 240,
      render: (_, r) => (
        <div className="table-actions">
          <Button size="small" onClick={() => setNoticeModal(r)}>{t('common.edit')}</Button>
          {r.status === 'published' && <Button size="small" onClick={() => offlineNotice(r)}>{t('dip.admin.notice.offlineAction')}</Button>}
          <Button type="default" size="small" danger onClick={() => deleteNotice(r)}>{t('common.delete')}</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="dip-page">
      <DipAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="purple">{t('dip.office.adminTitle')}</Title>
        </h1>
        <Button type="primary" icon={<PlusIcon />} onClick={() => setOfficeModal({})}>{t('dip.office.create')}</Button>
      </div>

      <Card>
        <Table className="table-fit" columns={officeColumns} dataSource={offices ?? []} loading={offices === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <div className="page-header">
        <h2 className="section-title">
          <Title size="middle">{t('dip.admin.notice.adminTitle')}</Title>
        </h2>
        <Button type="primary" icon={<PlusIcon />} onClick={() => setNoticeModal({})}>{t('dip.admin.notice.publish')}</Button>
      </div>
      <Card>
        <Table className="table-fit" columns={noticeColumns} dataSource={notices ?? []} loading={notices === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      {officeModal !== null && <OfficeModal initial={officeModal} onClose={() => setOfficeModal(null)} onSaved={load} />}
      {noticeModal !== null && <NoticeModal initial={noticeModal} offices={offices ?? []} onClose={() => setNoticeModal(null)} onSaved={load} />}
    </div>
  );
}
