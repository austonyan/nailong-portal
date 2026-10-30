// 站内信 — 删除申请状态变化的通知(source=archives,经邮政契约落库)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { InboxIcon, MailIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { ArchNav, fmtDateTime, toastArchError } from './shared.jsx';

const MESSAGE_COLORS = {
  submitted: 'app-blue',
  reviewing: 'app-teal',
  executing: 'app-blue',
  completed: 'app-green',
  rejected: 'app-red',
};

export default function ArchMessages() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    api
      .get('/archives/messages')
      .then((data) => {
        setItems(data.items);
        setUnread(data.unread);
      })
      .catch((err) => {
        toastArchError(err);
        setItems([]);
      });
  }, []);

  useEffect(load, [load]);

  const markRead = async (msg) => {
    if (msg.read) return;
    try {
      await api.post(`/archives/messages/${msg.id}/read`);
      setItems((prev) => prev?.map((item) => (item.id === msg.id ? { ...item, read: true } : item)));
      setUnread((prev) => Math.max(0, prev - 1));
    } catch (err) {
      toastArchError(err);
    }
  };

  const markAll = async () => {
    try {
      await api.post('/archives/messages/read');
      setItems((prev) => prev?.map((item) => ({ ...item, read: true })));
      setUnread(0);
    } catch (err) {
      toastArchError(err);
    }
  };

  const formatParams = (msg) => {
    const params = { ...msg.params };
    if (params.completedAt) params.completedAt = fmtDateTime(params.completedAt);
    return params;
  };

  const cardKeyDown = (action) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="arch-page">
      <ArchNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="brown">
            {t('arch.messages.title')}
          </Title>
        </h1>
        <div className="table-actions">
          <Button type="primary" icon={<InboxIcon />} disabled={!unread} onClick={markAll}>
            {t('arch.messages.markAll')}
            {unread > 0 && (
              <Tag size="small" color="app-red" variant="solid">
                {unread}
              </Tag>
            )}
          </Button>
        </div>
      </div>

      <div className="arch-msg-list">
        {(items ?? []).map((msg) => (
          <Card
            key={msg.id}
            className={`arch-msg-card ${msg.read ? '' : 'unread'}`}
            hoverable
            role="button"
            tabIndex={0}
            onClick={() => markRead(msg)}
            onKeyDown={cardKeyDown(() => markRead(msg))}
          >
            <div className="arch-msg-head">
              <Tag color={MESSAGE_COLORS[msg.type] || 'brown'} variant="soft" size="small">
                <MailIcon size={12} /> {t(`arch.msgType.${msg.type}`)}
              </Tag>
              <strong>{t(`arch.msg.${msg.type}.title`, formatParams(msg))}</strong>
              <span className="muted-text">{fmtDateTime(msg.createdAt)}</span>
            </div>
            <p className="arch-msg-body">{t(`arch.msg.${msg.type}.body`, formatParams(msg))}</p>
          </Card>
        ))}
        {items && items.length === 0 && (
          <Card type="dashed">
            <p className="arch-empty">{t('arch.messages.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}