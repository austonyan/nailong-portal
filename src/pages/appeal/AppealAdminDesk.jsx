// 投诉建议与工单处理台:两个队列 Tab,回复/受理/关闭/升级/转申诉指引,匿名保护。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Drawer, Input, Modal, Select, Table, Tabs, Tag, Title } from 'animal-island-ui';
import { EyeIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { openAppealMaterial } from '../../api/appeal.js';
import { TextArea, COMPLAINT_STATUS_COLORS, TICKET_STATUS_COLORS, fmtDateTime, toastAppealError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

const COMPLAINT_STATUS = ['', 'pending_accept', 'processing', 'replied', 'closed'];
const TICKET_STATUS = ['', 'pending', 'processing', 'replied', 'closed', 'escalated'];

export default function AppealAdminDesk() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('complaints');
  const [complaints, setComplaints] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [cStatus, setCStatus] = useState('');
  const [tStatus, setTStatus] = useState('');
  const [detail, setDetail] = useState(null); // { type: 'complaint' | 'ticket', data }
  const [action, setAction] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, tk] = await Promise.all([
        api.get(`/appeal/admin/complaints/queue${cStatus ? `?status=${cStatus}` : ''}`),
        api.get(`/appeal/admin/tickets/queue${tStatus ? `?status=${tStatus}` : ''}`),
      ]);
      setComplaints(c.items);
      setTickets(tk.items);
    } catch (err) {
      toastAppealError(t, err);
      setComplaints([]);
      setTickets([]);
    }
  }, [cStatus, tStatus, t]);

  useEffect(() => {
    load();
  }, [load]);

  const openComplaint = async (c) => {
    try {
      const data = await api.get(`/appeal/admin/complaints/${c.id}`);
      setDetail({ type: 'complaint', data: data.complaint });
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const openTicket = async (tk) => {
    try {
      const data = await api.get(`/appeal/admin/tickets/${tk.id}`);
      setDetail({ type: 'ticket', data: data.ticket });
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const runAction = async () => {
    if (!action || !detail) return;
    setBusy(true);
    try {
      const { type, data } = detail;
      if (type === 'complaint') {
        if (action === 'accept') await api.post(`/appeal/admin/complaints/${data.id}/accept`, {});
        else if (action === 'reply') await api.post(`/appeal/admin/complaints/${data.id}/reply`, { content: reply });
        else if (action === 'close') await api.post(`/appeal/admin/complaints/${data.id}/close`, { comment: reply });
        else if (action === 'escalate') await api.post(`/appeal/admin/complaints/${data.id}/escalate-appeal`, { comment: reply });
      } else {
        if (action === 'reply') await api.post(`/appeal/admin/tickets/${data.id}/reply`, { content: reply });
        else if (action === 'processing') await api.post(`/appeal/admin/tickets/${data.id}/status`, { status: 'processing' });
        else if (action === 'close') await api.post(`/appeal/admin/tickets/${data.id}/status`, { status: 'closed' });
        else if (action === 'escalated') await api.post(`/appeal/admin/tickets/${data.id}/status`, { status: 'escalated' });
      }
      toastSuccess(t('common.saved'));
      setAction(null);
      setReply('');
      if (type === 'complaint') {
        const fresh = await api.get(`/appeal/admin/complaints/${data.id}`);
        setDetail({ type, data: fresh.complaint });
      } else {
        const fresh = await api.get(`/appeal/admin/tickets/${data.id}`);
        setDetail({ type, data: fresh.ticket });
      }
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const complaintColumns = [
    { title: t('appeal.admin.colCode'), dataIndex: 'code', width: 170 },
    { title: t('appeal.admin.colApplicant'), dataIndex: 'username', width: 120 },
    {
      title: t('appeal.complaint.kindLabel'),
      dataIndex: 'kind',
      width: 90,
      render: (v) => <Tag variant="soft" color={v === 'complaint' ? 'app-red' : 'app-teal'}>{t(`appeal.complaintKind.${v}`)}</Tag>,
    },
    {
      title: t('appeal.complaint.categoryLabel'),
      dataIndex: 'category',
      width: 110,
      render: (v) => t(`appeal.complaintCategory.${v}`),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <Tag color={COMPLAINT_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`appeal.complaintStatus.${v}`)}
        </Tag>
      ),
    },
    { title: t('appeal.my.submittedAtLabel'), dataIndex: 'submittedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_v, record) => (
        <Button type="default" size="small" icon={<EyeIcon />} onClick={() => openComplaint(record)}>
          {t('appeal.my.view')}
        </Button>
      ),
    },
  ];

  const ticketColumns = [
    { title: t('appeal.admin.colCode'), dataIndex: 'code', width: 170 },
    { title: t('appeal.admin.colApplicant'), dataIndex: 'username', width: 120 },
    { title: t('appeal.ticket.titleLabel'), dataIndex: 'title' },
    {
      title: t('appeal.ticket.priorityLabel'),
      dataIndex: 'priority',
      width: 90,
      render: (v) => t(`appeal.ticketPriority.${v}`),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 110,
      render: (v) => (
        <Tag color={TICKET_STATUS_COLORS[v] || 'default'} variant="soft">
          {t(`appeal.ticketStatus.${v}`)}
        </Tag>
      ),
    },
    { title: t('appeal.my.submittedAtLabel'), dataIndex: 'submittedAt', width: 150, render: fmtDateTime },
    {
      title: t('common.actions'),
      dataIndex: 'actions',
      render: (_v, record) => (
        <Button type="default" size="small" icon={<EyeIcon />} onClick={() => openTicket(record)}>
          {t('appeal.my.view')}
        </Button>
      ),
    },
  ];

  const openAction = (kind) => {
    setReply('');
    setAction(kind);
  };

  return (
    <div className="appeal-admin-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.admin.deskTitle')}</Title>
      </div>

      <Card>
        <Tabs
          items={[
            { key: 'complaints', label: t('appeal.admin.tabComplaints'), children: (
              <>
                <div className="table-actions appeal-filter-bar">
                  <Select
                    value={cStatus}
                    onChange={setCStatus}
                    options={COMPLAINT_STATUS.map((s) => ({ key: s, label: s === '' ? t('appeal.admin.allStatus') : t(`appeal.complaintStatus.${s}`) }))}
                  />
                </div>
                <Table className="table-fit" columns={complaintColumns} dataSource={complaints ?? []} loading={complaints === null} rowKey="id" pagination={false} emptyText={t('appeal.admin.queueEmpty')} />
              </>
            ) },
            { key: 'tickets', label: t('appeal.admin.tabTickets'), children: (
              <>
                <div className="table-actions appeal-filter-bar">
                  <Select
                    value={tStatus}
                    onChange={setTStatus}
                    options={TICKET_STATUS.map((s) => ({ key: s, label: s === '' ? t('appeal.admin.allStatus') : t(`appeal.ticketStatus.${s}`) }))}
                  />
                </div>
                <Table className="table-fit" columns={ticketColumns} dataSource={tickets ?? []} loading={tickets === null} rowKey="id" pagination={false} emptyText={t('appeal.admin.queueEmpty')} />
              </>
            ) },
          ]}
          activeKey={tab}
          onChange={setTab}
        />
      </Card>

      <Drawer maskClosable={false} open={detail !== null} title={detail?.data?.code} onClose={() => setDetail(null)} width={560}>
        {detail && (
          <div className="appeal-detail-body">
            {detail.type === 'complaint' ? (
              <>
                <div className="appeal-detail-head">
                  <Tag color={COMPLAINT_STATUS_COLORS[detail.data.status] || 'default'} variant="solid">
                    {t(`appeal.complaintStatus.${detail.data.status}`)}
                  </Tag>
                  <span className="muted-text">
                    {detail.data.anonymous ? t('appeal.admin.anonymousUser') : `${detail.data.displayName} (@${detail.data.username})`}
                  </span>
                </div>
                <dl className="appeal-field-list">
                  <div>
                    <dt>{t('appeal.complaint.contentLabel')}</dt>
                    <dd>{detail.data.content}</dd>
                  </div>
                  <div>
                    <dt>{t('appeal.complaint.contactLabel')}</dt>
                    <dd>{detail.data.anonymous ? t('appeal.admin.contactHidden') : detail.data.contact || '-'}</dd>
                  </div>
                  <div>
                    <dt>{t('appeal.my.submittedAtLabel')}</dt>
                    <dd>{fmtDateTime(detail.data.submittedAt)}</dd>
                  </div>
                  {detail.data.reply && (
                    <div>
                      <dt>{t('appeal.complaint.replyLabel')}</dt>
                      <dd>
                        {detail.data.reply}
                        <p className="muted-text">
                          {detail.data.repliedName} · {fmtDateTime(detail.data.repliedAt)}
                        </p>
                      </dd>
                    </div>
                  )}
                </dl>
                <ul className="appeal-material-list">
                  {(detail.data.materials ?? []).map((m) => (
                    <li key={m.id}>
                      <Tag variant="soft" color="app-blue" size="small">{t(`appeal.materialKind.${m.kind}`)}</Tag>
                      <span>{m.filename}</span>
                      <Button type="text" size="small" onClick={() => openAppealMaterial(m.id)}>{t('appeal.my.preview')}</Button>
                    </li>
                  ))}
                </ul>
                <div className="table-actions appeal-admin-actions">
                  {detail.data.status === 'pending_accept' && (
                    <Button type="primary" onClick={() => openAction('accept')}>{t('appeal.admin.action.accept')}</Button>
                  )}
                  {['pending_accept', 'processing'].includes(detail.data.status) && (
                    <Button type="primary" onClick={() => openAction('reply')}>{t('appeal.admin.action.reply')}</Button>
                  )}
                  {['processing', 'replied'].includes(detail.data.status) && (
                    <>
                      <Button onClick={() => openAction('close')}>{t('appeal.admin.action.close')}</Button>
                      <Button onClick={() => openAction('escalate')}>{t('appeal.admin.action.escalateAppeal')}</Button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="appeal-detail-head">
                  <Tag color={TICKET_STATUS_COLORS[detail.data.status] || 'default'} variant="solid">
                    {t(`appeal.ticketStatus.${detail.data.status}`)}
                  </Tag>
                  <span className="muted-text">{detail.data.displayName} (@{detail.data.username})</span>
                </div>
                <dl className="appeal-field-list">
                  <div>
                    <dt>{t('appeal.ticket.titleLabel')}</dt>
                    <dd>{detail.data.title}</dd>
                  </div>
                  <div>
                    <dt>{t('appeal.ticket.contentLabel')}</dt>
                    <dd>{detail.data.content}</dd>
                  </div>
                </dl>
                <h4>{t('appeal.ticket.threadTitle')}</h4>
                <ul className="appeal-ticket-thread">
                  {(detail.data.replies ?? []).map((r) => (
                    <li key={r.id} className={r.isStaff ? 'staff' : 'user'}>
                      <div className="appeal-thread-head">
                        <Tag variant="soft" color={r.isStaff ? 'app-teal' : 'app-blue'} size="small">
                          {r.isStaff ? r.staffName || t('appeal.ticket.staffRole') : detail.data.username}
                        </Tag>
                        <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
                      </div>
                      <p>{r.content}</p>
                    </li>
                  ))}
                </ul>
                <div className="table-actions appeal-admin-actions">
                  {detail.data.status === 'pending' && (
                    <Button onClick={() => openAction('processing')}>{t('appeal.admin.action.startProcess')}</Button>
                  )}
                  {!['closed'].includes(detail.data.status) && (
                    <Button type="primary" onClick={() => openAction('reply')}>{t('appeal.admin.action.reply')}</Button>
                  )}
                  {detail.data.status !== 'closed' && (
                    <>
                      <Button onClick={() => openAction('escalated')}>{t('appeal.admin.action.escalate')}</Button>
                      <Button danger onClick={() => openAction('close')}>{t('appeal.admin.action.close')}</Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={action !== null}
        title={action ? t(`appeal.admin.action.${action === 'escalated' ? 'escalate' : action === 'processing' ? 'startProcess' : action}`) : ''}
        onClose={() => {
          if (!busy) setAction(null);
        }}
        maskClosable={false}
        typewriter={false}
        width={520}
        footer={
          <>
            <Button onClick={() => setAction(null)} disabled={busy}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              loading={busy}
              disabled={busy || ((action === 'reply' || action === 'close' || action === 'escalate') && !reply.trim())}
              onClick={runAction}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {['reply', 'close', 'escalate'].includes(action) && (
          <>
            <p>{t(action === 'reply' ? 'appeal.admin.replyLabel' : action === 'close' ? 'appeal.admin.closeCommentLabel' : 'appeal.admin.escalateTip')}</p>
            <TextArea rows={4} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} />
          </>
        )}
        {action === 'accept' && <p>{t('appeal.admin.acceptTip')}</p>}
        {action === 'processing' && <p>{t('appeal.admin.startProcessTip')}</p>}
        {action === 'escalated' && <p>{t('appeal.admin.escalateTicketTip')}</p>}
      </Modal>
    </div>
  );
}
