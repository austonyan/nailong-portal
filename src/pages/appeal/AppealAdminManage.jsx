// 申诉署管理:公告、公示、站内信模板、黑名单、重复申诉识别与系统配置。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Input, Modal, Select, Table, Tabs, Tag, Title } from 'animal-island-ui';
import { PlusIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import AutoApproveSettings from '../../components/AutoApproveSettings.jsx';
import { TextArea, fmtDateTime, toastAppealError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

const NOTICE_LEVELS = ['info', 'policy', 'event'];
const PUBLICITY_KINDS = ['stats', 'case', 'report'];
const BLACKLIST_SCOPES = ['all', 'appeal', 'complaint'];

export default function AppealAdminManage() {
  const { t } = useTranslation();
  const [notices, setNotices] = useState([]);
  const [publicity, setPublicity] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [config, setConfig] = useState([]);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [pubOpen, setPubOpen] = useState(false);
  const [blOpen, setBlOpen] = useState(false);
  const [blUser, setBlUser] = useState('');
  const [blScope, setBlScope] = useState('all');
  const [blReason, setBlReason] = useState('');
  const [nTitle, setNTitle] = useState('');
  const [nTitleTw, setNTitleTw] = useState('');
  const [nBody, setNBody] = useState('');
  const [nBodyTw, setNBodyTw] = useState('');
  const [nLevel, setNLevel] = useState('info');
  const [pTitle, setPTitle] = useState('');
  const [pTitleTw, setPTitleTw] = useState('');
  const [pBody, setPBody] = useState('');
  const [pBodyTw, setPBodyTw] = useState('');
  const [pKind, setPKind] = useState('case');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, p, tp, bl, dup, cfg] = await Promise.all([
        api.get('/appeal/admin/notices'),
        api.get('/appeal/admin/publicity'),
        api.get('/appeal/admin/templates'),
        api.get('/appeal/admin/blacklist'),
        api.get('/appeal/admin/duplicates'),
        api.get('/appeal/admin/config'),
      ]);
      setNotices(n.items);
      setPublicity(p.items);
      setTemplates(tp.items);
      setBlacklist(bl.items);
      setDuplicates(dup.items);
      setConfig(cfg.items);
    } catch (err) {
      toastAppealError(t, err);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const createNotice = async () => {
    setBusy(true);
    try {
      await api.post('/appeal/admin/notices', { title: nTitle, titleTw: nTitleTw, body: nBody, bodyTw: nBodyTw, level: nLevel });
      toastSuccess(t('common.saved'));
      setNoticeOpen(false);
      setNTitle('');
      setNTitleTw('');
      setNBody('');
      setNBodyTw('');
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const toggleNotice = async (n) => {
    try {
      await api.patch(`/appeal/admin/notices/${n.id}`, { enabled: !n.enabled });
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const deleteNotice = async (n) => {
    try {
      await api.del(`/appeal/admin/notices/${n.id}`);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const createPublicity = async () => {
    setBusy(true);
    try {
      await api.post('/appeal/admin/publicity', { title: pTitle, titleTw: pTitleTw, body: pBody, bodyTw: pBodyTw, kind: pKind });
      toastSuccess(t('common.saved'));
      setPubOpen(false);
      setPTitle('');
      setPTitleTw('');
      setPBody('');
      setPBodyTw('');
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const setPubStatus = async (p, status) => {
    try {
      await api.patch(`/appeal/admin/publicity/${p.id}`, { status });
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const toggleTemplate = async (tp) => {
    try {
      await api.patch(`/appeal/admin/templates/${tp.type}`, { enabled: !tp.enabled });
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const addBlacklist = async () => {
    setBusy(true);
    try {
      await api.post('/appeal/admin/blacklist', { userId: Number(blUser), scope: blScope, reason: blReason });
      toastSuccess(t('common.saved'));
      setBlOpen(false);
      setBlUser('');
      setBlReason('');
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const removeBlacklist = async (row) => {
    try {
      await api.del(`/appeal/admin/blacklist/${row.userId}`);
      toastSuccess(t('common.deleted'));
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const saveConfig = async (key, value) => {
    try {
      await api.put('/appeal/admin/config', { [key]: value });
      toastSuccess(t('common.saved'));
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const noticeColumns = [
    { title: t('appeal.admin.colTitle'), dataIndex: 'title' },
    { title: t('appeal.admin.colLevel'), dataIndex: 'level', width: 100, render: (v) => t(`appeal.noticeLevel.${v}`) },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 90,
      render: (v) => <Tag variant="soft" color={v ? 'app-green' : 'default'}>{v ? t('appeal.admin.enabled') : t('appeal.admin.disabled')}</Tag>,
    },
    { title: t('appeal.inspect.colTime'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      width: 170,
      render: (_v, row) => (
        <>
          <Button type="text" size="small" onClick={() => toggleNotice(row)}>{row.enabled ? t('appeal.admin.disable') : t('appeal.admin.enable')}</Button>
          <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => deleteNotice(row)}>{t('common.delete')}</Button>
        </>
      ),
    },
  ];

  const pubColumns = [
    { title: t('appeal.admin.colTitle'), dataIndex: 'title' },
    { title: t('appeal.admin.colKind'), dataIndex: 'kind', width: 100, render: (v) => t(`appeal.publicityKind.${v}`) },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <Tag variant="soft" color={v === 'published' ? 'app-green' : v === 'offline' ? 'app-red' : 'default'}>
          {t(`appeal.publicityStatus.${v}`)}
        </Tag>
      ),
    },
    { title: t('appeal.inspect.colTime'), dataIndex: 'updatedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      width: 220,
      render: (_v, row) => (
        <>
          {row.status !== 'published' && <Button type="text" size="small" onClick={() => setPubStatus(row, 'published')}>{t('appeal.admin.publish')}</Button>}
          {row.status === 'published' && <Button type="text" size="small" danger onClick={() => setPubStatus(row, 'offline')}>{t('appeal.admin.offline')}</Button>}
          {row.status === 'offline' && <Button type="text" size="small" onClick={() => setPubStatus(row, 'draft')}>{t('appeal.admin.backToDraft')}</Button>}
        </>
      ),
    },
  ];

  const tplColumns = [
    { title: t('appeal.admin.colType'), dataIndex: 'type', width: 220 },
    { title: t('appeal.admin.colTitle'), dataIndex: 'title' },
    {
      title: t('common.status'),
      dataIndex: 'enabled',
      width: 100,
      render: (v) => <Tag variant="soft" color={v ? 'app-green' : 'default'}>{v ? t('appeal.admin.enabled') : t('appeal.admin.disabled')}</Tag>,
    },
    { title: t('appeal.admin.colVars'), dataIndex: 'body', render: (v) => <span className="muted-text">{v}</span> },
    {
      title: t('common.actions'),
      width: 100,
      render: (_v, row) => (
        <Button type="text" size="small" onClick={() => toggleTemplate(row)}>{row.enabled ? t('appeal.admin.disable') : t('appeal.admin.enable')}</Button>
      ),
    },
  ];

  const blColumns = [
    { title: t('appeal.admin.colUser'), dataIndex: 'username', width: 140 },
    { title: t('appeal.admin.colScope'), dataIndex: 'scope', width: 110, render: (v) => t(`appeal.blacklistScope.${v}`) },
    { title: t('appeal.admin.colReason'), dataIndex: 'reason' },
    { title: t('appeal.inspect.colTime'), dataIndex: 'createdAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      width: 100,
      render: (_v, row) => (
        <Button type="text" size="small" danger onClick={() => removeBlacklist(row)}>{t('appeal.admin.unblacklist')}</Button>
      ),
    },
  ];

  const dupColumns = [
    { title: t('appeal.admin.colUser'), dataIndex: 'user_id', width: 100 },
    { title: t('appeal.apply.bizType'), dataIndex: 'biz_type', width: 110, render: (v) => t(`appeal.bizType.${v}`) },
    { title: t('appeal.apply.bizCode'), dataIndex: 'biz_code', width: 180 },
    { title: t('appeal.admin.dupCount'), dataIndex: 'n', width: 90 },
    { title: t('appeal.admin.dupCodes'), dataIndex: 'codes' },
  ];

  return (
    <div className="appeal-admin-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.admin.manageTitle')}</Title>
      </div>

      <Card>
        <Tabs
          activeKey="notices"
          items={[
            {
              key: 'notices',
              label: t('appeal.admin.tabNotices'),
              children: (
                <>
                  <div className="table-actions appeal-filter-bar">
                    <Button type="primary" icon={<PlusIcon />} onClick={() => setNoticeOpen(true)}>{t('appeal.admin.createNotice')}</Button>
                  </div>
                  <Table className="table-fit" columns={noticeColumns} dataSource={notices} rowKey="id" pagination={false} emptyText={t('common.empty')} />
                </>
              ),
            },
            {
              key: 'publicity',
              label: t('appeal.admin.tabPublicity'),
              children: (
                <>
                  <div className="table-actions appeal-filter-bar">
                    <Button type="primary" icon={<PlusIcon />} onClick={() => setPubOpen(true)}>{t('appeal.admin.createPublicity')}</Button>
                  </div>
                  <p className="muted-text">{t('appeal.admin.publicityTip')}</p>
                  <Table className="table-fit" columns={pubColumns} dataSource={publicity} rowKey="id" pagination={false} emptyText={t('common.empty')} />
                </>
              ),
            },
            {
              key: 'templates',
              label: t('appeal.admin.tabTemplates'),
              children: (
                <>
                  <p className="muted-text">{t('appeal.admin.templateTip')}</p>
                  <Table className="table-fit" columns={tplColumns} dataSource={templates} rowKey="type" pagination={false} emptyText={t('common.empty')} />
                </>
              ),
            },
            {
              key: 'risk',
              label: t('appeal.admin.tabRisk'),
              children: (
                <>
                  <div className="table-actions appeal-filter-bar">
                    <Button type="primary" icon={<PlusIcon />} onClick={() => setBlOpen(true)}>{t('appeal.admin.addBlacklist')}</Button>
                  </div>
                  <h4>{t('appeal.admin.tabBlacklist')}</h4>
                  <Table className="table-fit" columns={blColumns} dataSource={blacklist} rowKey="id" pagination={false} emptyText={t('common.empty')} />
                  <h4>{t('appeal.admin.tabDuplicates')}</h4>
                  <p className="muted-text">{t('appeal.admin.dupTip')}</p>
                  <Table className="table-fit" columns={dupColumns} dataSource={duplicates} rowKey="codes" pagination={false} emptyText={t('common.empty')} />
                </>
              ),
            },
            {
              key: 'config',
              label: t('appeal.admin.tabConfig'),
              children: (
                <div>
                  <AutoApproveSettings service="appeal" />
                  <div className="appeal-config-list">
                    {config.map((c) => (
                      <div key={c.key} className="appeal-config-row">
                        <span>{c.key}</span>
                        <Input
                          size="small"
                          defaultValue={c.value}
                          onBlur={(e) => e.target.value !== c.value && saveConfig(c.key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        maskClosable={false}
        open={noticeOpen}
        title={t('appeal.admin.createNotice')}
        onClose={() => setNoticeOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setNoticeOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!nTitle.trim()} onClick={createNotice}>{t('common.confirm')}</Button>
          </>
        }
      >
        <div className="appeal-complaint-form">
          <p>{t('appeal.admin.colLevel')}</p>
          <Select value={nLevel} onChange={setNLevel} options={NOTICE_LEVELS.map((l) => ({ key: l, label: t(`appeal.noticeLevel.${l}`) }))} />
          <p>{t('appeal.admin.colTitle')}</p>
          <Input size="large" maxLength={120} value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
          <p>{t('appeal.admin.colTitle')} · {t('common.traditional')}</p>
          <Input size="large" maxLength={120} value={nTitleTw} placeholder={t('common.twOptional')} onChange={(e) => setNTitleTw(e.target.value)} />
          <p>{t('appeal.admin.colBody')}</p>
          <TextArea rows={5} maxLength={2000} value={nBody} onChange={(e) => setNBody(e.target.value)} />
          <p>{t('appeal.admin.colBody')} · {t('common.traditional')}</p>
          <TextArea rows={5} maxLength={2000} value={nBodyTw} placeholder={t('common.twOptional')} onChange={(e) => setNBodyTw(e.target.value)} />
        </div>
      </Modal>

      <Modal
        maskClosable={false}
        open={pubOpen}
        title={t('appeal.admin.createPublicity')}
        onClose={() => setPubOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setPubOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!pTitle.trim()} onClick={createPublicity}>{t('common.confirm')}</Button>
          </>
        }
      >
        <div className="appeal-complaint-form">
          <p>{t('appeal.admin.colKind')}</p>
          <Select value={pKind} onChange={setPKind} options={PUBLICITY_KINDS.map((k) => ({ key: k, label: t(`appeal.publicityKind.${k}`) }))} />
          <p>{t('appeal.admin.colTitle')}</p>
          <Input size="large" maxLength={120} value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
          <p>{t('appeal.admin.colTitle')} · {t('common.traditional')}</p>
          <Input size="large" maxLength={120} value={pTitleTw} placeholder={t('common.twOptional')} onChange={(e) => setPTitleTw(e.target.value)} />
          <p>{t('appeal.admin.colBody')}</p>
          <TextArea rows={6} maxLength={4000} value={pBody} onChange={(e) => setPBody(e.target.value)} placeholder={t('appeal.admin.publicityPlaceholder')} />
          <p>{t('appeal.admin.colBody')} · {t('common.traditional')}</p>
          <TextArea rows={6} maxLength={4000} value={pBodyTw} placeholder={t('common.twOptional')} onChange={(e) => setPBodyTw(e.target.value)} />
        </div>
      </Modal>

      <Modal
        maskClosable={false}
        open={blOpen}
        title={t('appeal.admin.addBlacklist')}
        onClose={() => setBlOpen(false)}
        typewriter={false}
        width={520}
        footer={
          <>
            <Button onClick={() => setBlOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!blUser.trim()} onClick={addBlacklist}>{t('common.confirm')}</Button>
          </>
        }
      >
        <div className="appeal-complaint-form">
          <p>{t('appeal.admin.blacklistUserLabel')}</p>
          <Input size="large" value={blUser} onChange={(e) => setBlUser(e.target.value)} placeholder={t('appeal.admin.blacklistUserPlaceholder')} />
          <p>{t('appeal.admin.colScope')}</p>
          <Select value={blScope} onChange={setBlScope} options={BLACKLIST_SCOPES.map((s) => ({ key: s, label: t(`appeal.blacklistScope.${s}`) }))} />
          <p>{t('appeal.admin.colReason')}</p>
          <TextArea rows={3} maxLength={200} value={blReason} onChange={(e) => setBlReason(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
