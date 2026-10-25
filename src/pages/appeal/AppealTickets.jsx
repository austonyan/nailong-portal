// 工单客服:一般咨询/账号问题/故障报修,分类与优先级、进度与回复记录、常见问题自助。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Collapse,
  Drawer,
  Input,
  Modal,
  Notification,
  Select,
  Tag,
  Title,
} from 'animal-island-ui';
import { PlusIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { TextArea, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUS_COLORS, fmtDateTime, toastAppealError } from './shared.jsx';

const FAQ_KEYS = ['reset', 'unbind', 'slow', 'display', 'contact'];

export default function AppealTickets() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [category, setCategory] = useState('consult');
  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [faqQuery, setFaqQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get('/appeal/tickets');
      setItems(data.items);
    } catch (err) {
      toastAppealError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const doCreate = async () => {
    setBusy(true);
    try {
      const data = await api.post('/appeal/tickets', { category, priority, title, content });
      Notification.success(t('appeal.ticket.submitDone', { no: data.ticket.code }));
      setCreateOpen(false);
      setTitle('');
      setContent('');
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (tk) => {
    try {
      const data = await api.get(`/appeal/tickets/${tk.id}`);
      setDetail(data.ticket);
      setReply('');
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const doReply = async () => {
    setBusy(true);
    try {
      await api.post(`/appeal/tickets/${detail.id}/reply`, { content: reply });
      Notification.success(t('appeal.ticket.replyDone'));
      const data = await api.get(`/appeal/tickets/${detail.id}`);
      setDetail(data.ticket);
      setReply('');
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const doClose = async () => {
    setBusy(true);
    try {
      await api.post(`/appeal/tickets/${detail.id}/close`, {});
      Notification.success(t('appeal.ticket.closeDone'));
      const data = await api.get(`/appeal/tickets/${detail.id}`);
      setDetail(data.ticket);
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const faqKeys = FAQ_KEYS.filter((k) => {
    if (!faqQuery.trim()) return true;
    const q = t(`appeal.ticket.faq.${k}.q`);
    const a = t(`appeal.ticket.faq.${k}.a`);
    return q.includes(faqQuery.trim()) || a.includes(faqQuery.trim());
  });

  return (
    <div className="appeal-list-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.ticket.title')}</Title>
        <div className="table-actions appeal-filter-bar">
          <Button type="primary" icon={<PlusIcon />} onClick={() => setCreateOpen(true)}>
            {t('appeal.ticket.create')}
          </Button>
        </div>
      </div>

      {items === null && (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      )}
      {items !== null && items.length === 0 && (
        <Card type="dashed">
          <p className="muted-text">{t('common.empty')}</p>
        </Card>
      )}

      {(items ?? []).map((tk) => (
        <Card key={tk.id} hoverable className="appeal-item-card" onClick={() => openDetail(tk)}>
          <div className="appeal-item-head">
            <strong>{tk.code}</strong>
            <Tag color={TICKET_STATUS_COLORS[tk.status] || 'default'} variant="soft">
              {t(`appeal.ticketStatus.${tk.status}`)}
            </Tag>
            <Tag variant="outlined">{t(`appeal.ticketPriority.${tk.priority}`)}</Tag>
          </div>
          <p className="muted-text">
            {t(`appeal.ticketCategory.${tk.category}`)} · {t('appeal.my.submittedAt', { time: fmtDateTime(tk.submittedAt || tk.createdAt) })}
          </p>
          <p className="appeal-item-reason">{tk.title}</p>
        </Card>
      ))}

      <Card className="appeal-faq-card">
        <h4>{t('appeal.ticket.faqTitle')}</h4>
        <Input
          size="large"
          allowClear
          prefix={<SearchIcon size={14} />}
          placeholder={t('appeal.ticket.faqSearch')}
          value={faqQuery}
          onChange={(e) => setFaqQuery(e.target.value)}
        />
        <div className="appeal-faq">
          {faqKeys.map((k) => (
            <Collapse key={k} question={t(`appeal.ticket.faq.${k}.q`)} answer={t(`appeal.ticket.faq.${k}.a`)} />
          ))}
        </div>
      </Card>

      <Modal
        open={createOpen}
        title={t('appeal.ticket.createTitle')}
        onClose={() => setCreateOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!title.trim() || content.trim().length < 5} onClick={doCreate}>
              {t('appeal.ticket.submit')}
            </Button>
          </>
        }
      >
        <div className="appeal-ticket-form">
          <p>{t('appeal.ticket.categoryLabel')}</p>
          <Select value={category} onChange={setCategory} options={TICKET_CATEGORIES.map((c) => ({ key: c, label: t(`appeal.ticketCategory.${c}`) }))} />
          <p>{t('appeal.ticket.priorityLabel')}</p>
          <Select value={priority} onChange={setPriority} options={TICKET_PRIORITIES.map((p) => ({ key: p, label: t(`appeal.ticketPriority.${p}`) }))} />
          <p>{t('appeal.ticket.titleLabel')}</p>
          <Input size="large" allowClear maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('appeal.ticket.titlePlaceholder')} />
          <p>{t('appeal.ticket.contentLabel')}</p>
          <TextArea rows={5} maxLength={2000} value={content} onChange={(e) => setContent(e.target.value)} placeholder={t('appeal.ticket.contentPlaceholder')} />
        </div>
      </Modal>

      <Drawer open={!!detail} title={detail?.code} onClose={() => setDetail(null)} width={520}>
        {detail && (
          <div className="appeal-detail-body">
            <dl className="appeal-field-list">
              <div>
                <dt>{t('common.status')}</dt>
                <dd>
                  <Tag color={TICKET_STATUS_COLORS[detail.status] || 'default'} variant="soft">
                    {t(`appeal.ticketStatus.${detail.status}`)}
                  </Tag>
                  <Tag variant="outlined">{t(`appeal.ticketCategory.${detail.category}`)}</Tag>
                </dd>
              </div>
              <div>
                <dt>{t('appeal.ticket.titleLabel')}</dt>
                <dd>{detail.title}</dd>
              </div>
              <div>
                <dt>{t('appeal.ticket.contentLabel')}</dt>
                <dd>{detail.content}</dd>
              </div>
            </dl>
            <h4>{t('appeal.ticket.threadTitle')}</h4>
            <ul className="appeal-ticket-thread">
              {detail.replies.map((r) => (
                <li key={r.id} className={r.isStaff ? 'staff' : 'user'}>
                  <div className="appeal-thread-head">
                    <Tag variant="soft" color={r.isStaff ? 'app-teal' : 'app-blue'} size="small">
                      {r.isStaff ? r.staffName || t('appeal.ticket.staffRole') : t('appeal.ticket.userRole')}
                    </Tag>
                    <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
                  </div>
                  <p>{r.content}</p>
                </li>
              ))}
              {detail.replies.length === 0 && (
                <li className="muted-text">{t('appeal.ticket.noReplies')}</li>
              )}
            </ul>
            {!['closed', 'escalated'].includes(detail.status) && (
              <div className="appeal-ticket-reply-box">
                <TextArea rows={3} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('appeal.ticket.replyPlaceholder')} />
                <div className="table-actions">
                  <Button danger onClick={doClose} loading={busy}>
                    {t('appeal.ticket.close')}
                  </Button>
                  <Button type="primary" loading={busy} disabled={!reply.trim()} onClick={doReply}>
                    {t('appeal.ticket.sendReply')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
