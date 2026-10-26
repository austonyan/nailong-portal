// 消息与帮助:站内信已读/未读/归档、工单入口与防诈骗提示。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Tabs, Tag, Title } from 'animal-island-ui';
import { BellIcon, FolderPlusIcon, MailIcon, SendIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { TextArea, fmtDateTime, toastProtocolError } from './shared.jsx';
import { toastSuccess, toastError } from './shared.jsx';

function MessageList({ items, t, onRead, onArchive }) {
  if (!items || items.length === 0) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('protocol.messages.empty')}</p>
      </Card>
    );
  }
  return (
    <div className="protocol-msg-list">
      {items.map((m) => (
        <Card key={m.id} className={`protocol-msg-card ${m.read ? '' : 'unread'}`}>
          <div className="protocol-msg-head">
            <BellIcon size={18} />
            <strong>{m.title}</strong>
            <span className="muted-text">{fmtDateTime(m.createdAt)}</span>
          </div>
          <p className="protocol-preline">{m.body}</p>
          <div className="protocol-msg-actions">
            {!m.read && (
              <Button type="text" size="small" onClick={() => onRead(m)}>
                {t('protocol.messages.markRead')}
              </Button>
            )}
            {!m.archived && (
              <Button type="text" size="small" icon={<FolderPlusIcon />} onClick={() => onArchive(m)}>
                {t('protocol.messages.archive')}
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function ProtocolMessages() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('inbox');
  const [items, setItems] = useState(null);
  const [archived, setArchived] = useState(null);
  const [unread, setUnread] = useState(0);
  const [tickets, setTickets] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [inbox, arch, support] = await Promise.all([
        api.get('/protocol/messages'),
        api.get('/protocol/messages?archived=1'),
        api.get('/protocol/support'),
      ]);
      setItems(inbox.items);
      setUnread(inbox.unread);
      setArchived(arch.items);
      setTickets(support.items);
    } catch (err) {
      toastProtocolError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (msg) => {
    try {
      await api.post(`/protocol/messages/${msg.id}/read`);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const archive = async (msg) => {
    try {
      await api.post(`/protocol/messages/${msg.id}/archive`);
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    }
  };

  const submitTicket = async () => {
    if (!subject.trim() || !body.trim()) {
      toastError(t('protocol.messages.supportRequired'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/protocol/support', { subject, body });
      toastSuccess(t('protocol.messages.supportDone'));
      setSubject('');
      setBody('');
      await load();
    } catch (err) {
      toastProtocolError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const inboxTab = (
    <MessageList items={items} t={t} onRead={markRead} onArchive={archive} />
  );
  const archivedTab = (
    <MessageList items={archived} t={t} onRead={markRead} onArchive={archive} />
  );
  const supportTab = (
    <div className="protocol-support-layout">
      <Card className="protocol-form-card">
        <h4>{t('protocol.messages.supportTitle')}</h4>
        <p className="muted-text">{t('protocol.messages.supportTip')}</p>
        <label className="protocol-field">
          <span>{t('protocol.field.subject')}</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('protocol.messages.subjectPlaceholder')} />
        </label>
        <label className="protocol-field">
          <span>{t('protocol.field.body')}</span>
          <TextArea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('protocol.messages.bodyPlaceholder')} />
        </label>
        <Button type="primary" icon={<SendIcon />} loading={busy} onClick={submitTicket} disabled={busy}>
          {t('protocol.messages.submitSupport')}
        </Button>
      </Card>
      <Card className="protocol-privacy-card">
        <h4><ShieldIcon size={18} /> {t('protocol.messages.privacyTitle')}</h4>
        <p className="muted-text">{t('protocol.messages.privacyTip')}</p>
        <Button type="text" size="small" danger onClick={() => setEraseOpen(true)}>
          {t('protocol.messages.eraseData')}
        </Button>
      </Card>
      <Card>
        <h4>{t('protocol.messages.myTickets')}</h4>
        {tickets.length === 0 && <p className="muted-text">{t('protocol.messages.noTickets')}</p>}
        <ul className="protocol-ticket-list">
          {tickets.map((tk) => (
            <li key={tk.id}>
              <div className="protocol-inline-between">
                <strong>{tk.subject}</strong>
                <Tag color={tk.status === 'closed' ? 'app-green' : 'app-yellow'} variant="soft" size="small">
                  {t(`protocol.messages.ticket_${tk.status}`)}
                </Tag>
              </div>
              <p className="muted-text">{tk.body}</p>
              {tk.reply && (
                <p className="protocol-ticket-reply">
                  <MailIcon size={14} /> {tk.reply}
                </p>
              )}
              <span className="muted-text">{fmtDateTime(tk.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('protocol.messages.title')}</Title>
        <p className="muted-text">{t('protocol.messages.subtitle')}</p>
      </div>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'inbox', label: t('protocol.messages.inbox', { count: unread }), children: inboxTab },
          { key: 'archived', label: t('protocol.messages.archivedTab'), children: archivedTab },
          { key: 'support', label: t('protocol.messages.supportTab'), children: supportTab },
        ]}
      />

      <Modal
        open={eraseOpen}
        title={t('protocol.messages.eraseTitle')}
        onClose={() => setEraseOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setEraseOpen(false)}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              danger
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.post('/protocol/privacy/erase');
                  toastSuccess(t('protocol.messages.eraseDone'));
                  setEraseOpen(false);
                  await load();
                } catch (err) {
                  toastProtocolError(t, err);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('protocol.messages.eraseData')}
            </Button>
          </>
        }
      >
        <p>{t('protocol.messages.eraseTip')}</p>
      </Modal>

      <Card color="app-yellow" className="protocol-scam-banner protocol-mt">
        <div className="protocol-scam-inner">
          <BellIcon size={20} />
          <div>
            <strong>{t('protocol.scamTitle')}</strong>
            <p>{t('protocol.scamBody')}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}