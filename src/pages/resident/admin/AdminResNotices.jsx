// 公告与消息模板:公告发布/编辑/下线,站内信模板编辑与发送记录。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Notification, Select, Switch, Table, Tabs, Tag, Title } from 'animal-island-ui';
import { EditIcon, PlusIcon } from 'naive-icons';
import { api } from '../../../api/client.js';
import { ResAdminNav } from '../ResidentShell.jsx';
import { NOTICE_LEVEL_COLORS, TextArea, fmtDateTime, toastResError } from '../shared.jsx';

const LEVELS = ['info', 'policy', 'event'];
const EMPTY_NOTICE = { id: null, title: '', body: '', level: 'info', enabled: true };

export default function AdminResNotices() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('notices');
  const [notices, setNotices] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [messages, setMessages] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [noticeForm, setNoticeForm] = useState(EMPTY_NOTICE);
  const [editingTpl, setEditingTpl] = useState(null);
  const [tplTitle, setTplTitle] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgQ, setMsgQ] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/resident/admin/notices');
      setNotices(data.items);
    } catch (err) {
      toastResError(t, err);
      setNotices([]);
    }
    try {
      const data = await api.get('/resident/admin/templates');
      setTemplates(data.items);
    } catch {
      setTemplates([]);
    }
    try {
      const data = await api.get(`/resident/admin/messages${msgQ ? `?q=${encodeURIComponent(msgQ)}` : ''}`);
      setMessages(data.items);
    } catch {
      setMessages([]);
    }
  }, [t, msgQ]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setNoticeForm(EMPTY_NOTICE);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setNoticeForm({ id: row.id, title: row.title, body: row.body, level: row.level, enabled: row.enabled });
    setModalOpen(true);
  };

  const saveNotice = async () => {
    setBusy(true);
    try {
      if (noticeForm.id) await api.patch(`/resident/admin/notices/${noticeForm.id}`, noticeForm);
      else await api.post('/resident/admin/notices', noticeForm);
      Notification.success(t('common.save'));
      setModalOpen(false);
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const removeNotice = async (row) => {
    try {
      await api.del(`/resident/admin/notices/${row.id}`);
      Notification.success(t('common.save'));
      load();
    } catch (err) {
      toastResError(t, err);
    }
  };

  const toggleNotice = async (row) => {
    try {
      await api.patch(`/resident/admin/notices/${row.id}`, { enabled: !row.enabled });
      load();
    } catch (err) {
      toastResError(t, err);
    }
  };

  const openTemplate = (tpl) => {
    setEditingTpl(tpl);
    setTplTitle(tpl.titleTemplate);
    setTplBody(tpl.bodyTemplate);
  };

  const saveTemplate = async () => {
    setBusy(true);
    try {
      await api.patch(`/resident/admin/templates/${editingTpl.code}`, { titleTemplate: tplTitle, bodyTemplate: tplBody });
      Notification.success(t('common.save'));
      setEditingTpl(null);
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const noticeColumns = [
    { title: t('res.admin.notices.title'), dataIndex: 'title', width: 200 },
    {
      title: t('res.admin.notices.level'),
      dataIndex: 'level',
      width: 100,
      render: (v) => (
        <Tag color={NOTICE_LEVEL_COLORS[v] || 'default'} variant="soft">
          {t(`res.noticeLevel.${v}`)}
        </Tag>
      ),
    },
    { title: t('res.admin.notices.body'), dataIndex: 'body', render: (v) => v || '-' },
    {
      title: t('res.admin.notices.enabled'),
      dataIndex: 'enabled',
      width: 90,
      render: (v, record) => <Switch value={v} onChange={() => toggleNotice(record)} />,
    },
    { title: t('res.field.createdAt'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      width: 140,
      render: (_, record) => (
        <div className="table-actions">
          <Button type="default" size="small" icon={<EditIcon />} onClick={() => openEdit(record)}>
            {t('common.edit')}
          </Button>
          <Button type="text" size="small" danger onClick={() => removeNotice(record)}>
            {t('common.delete')}
          </Button>
        </div>
      ),
    },
  ];

  const messageColumns = [
    { title: t('res.admin.messages.to'), dataIndex: 'username', width: 120 },
    { title: t('res.admin.messages.title'), dataIndex: 'title' },
    { title: t('res.admin.messages.template'), dataIndex: 'template_code', width: 160 },
    {
      title: t('res.admin.messages.read'),
      dataIndex: 'read',
      width: 90,
      render: (v) => (
        <Tag variant="soft" color={v ? 'default' : 'app-yellow'}>
          {v ? t('res.messages.readTag') : t('res.messages.unreadTag')}
        </Tag>
      ),
    },
    { title: t('res.field.createdAt'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
  ];

  return (
    <div className="res-admin-page">
      <ResAdminNav />
      <div className="page-header">
        <Title size="middle">{t('res.admin.notices.title')}</Title>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'notices',
            label: t('res.admin.notices.tabNotices'),
            children: (
              <Card>
                <div className="table-actions res-filter-bar">
                  <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
                    {t('res.admin.notices.create')}
                  </Button>
                </div>
                <Table columns={noticeColumns} dataSource={notices ?? []} loading={notices === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
              </Card>
            ),
          },
          {
            key: 'templates',
            label: t('res.admin.notices.tabTemplates'),
            children: (
              <Card>
                <p className="muted-text">{t('res.admin.notices.templatesTip')}</p>
                <div className="res-tpl-list">
                  {(templates ?? []).map((tpl) => (
                    <div key={tpl.code} className="res-tpl-item">
                      <div className="res-tpl-head">
                        <b>{t(`res.msgTpl.${tpl.code}`, { defaultValue: tpl.code })}</b>
                        <Tag size="small" variant="soft" color="app-blue">
                          {tpl.variables || '-'}
                        </Tag>
                        <Button type="text" size="small" icon={<EditIcon />} onClick={() => openTemplate(tpl)}>
                          {t('common.edit')}
                        </Button>
                      </div>
                      <p className="res-tpl-title">{tpl.titleTemplate}</p>
                      <p className="muted-text res-tpl-body">{tpl.bodyTemplate}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ),
          },
          {
            key: 'messages',
            label: t('res.admin.notices.tabMessages'),
            children: (
              <Card>
                <div className="table-actions res-filter-bar">
                  <Input size="middle" allowClear placeholder={t('res.admin.searchPlaceholder')} value={msgQ} onChange={(e) => setMsgQ(e.target.value)} />
                </div>
                <Table columns={messageColumns} dataSource={messages ?? []} loading={messages === null} rowKey="id" pagination={false} emptyText={t('common.empty')} />
              </Card>
            ),
          },
        ]}
      />

      <Modal
        open={modalOpen}
        title={noticeForm.id ? t('res.admin.notices.edit') : t('res.admin.notices.create')}
        onClose={() => setModalOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!noticeForm.title.trim()} onClick={saveNotice}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="res-type-form">
          <label>
            <span>{t('res.admin.notices.title')} *</span>
            <Input size="large" value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} />
          </label>
          <label>
            <span>{t('res.admin.notices.level')}</span>
            <Select value={noticeForm.level} onChange={(v) => setNoticeForm({ ...noticeForm, level: v })} options={LEVELS.map((l) => ({ key: l, label: t(`res.noticeLevel.${l}`) }))} />
          </label>
          <label>
            <span>{t('res.admin.notices.body')}</span>
            <TextArea rows={4} maxLength={2000} value={noticeForm.body} onChange={(e) => setNoticeForm({ ...noticeForm, body: e.target.value })} />
          </label>
        </div>
      </Modal>

      <Modal
        open={editingTpl !== null}
        title={editingTpl ? t(`res.msgTpl.${editingTpl.code}`, { defaultValue: editingTpl.code }) : ''}
        onClose={() => setEditingTpl(null)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setEditingTpl(null)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} onClick={saveTemplate}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="res-type-form">
          <label>
            <span>{t('res.admin.notices.tplTitle')}</span>
            <Input size="large" value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} />
          </label>
          <label>
            <span>{t('res.admin.notices.tplBody')}</span>
            <TextArea rows={5} maxLength={1000} value={tplBody} onChange={(e) => setTplBody(e.target.value)} />
          </label>
          {editingTpl && (
            <p className="muted-text">
              {t('res.admin.notices.tplVars')}: {editingTpl.variables || '-'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
