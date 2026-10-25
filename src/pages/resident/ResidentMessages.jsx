// 站内信:已读/未读、归档与消息列表(服务端模板渲染)。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tabs, Tag, Title } from 'animal-island-ui';
import { InboxIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastResError } from './shared.jsx';

export default function ResidentMessages() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(0);
  const [archived, setArchived] = useState('0');

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/resident/messages?archived=${archived}`);
      setItems(data.items);
      setUnread(data.unread);
    } catch (err) {
      toastResError(t, err);
      setItems([]);
    }
  }, [archived, t]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (msg) => {
    if (msg.read) return;
    try {
      await api.post(`/resident/messages/${msg.id}/read`);
      load();
    } catch (err) {
      toastResError(t, err);
    }
  };

  const archive = async (msg) => {
    try {
      await api.post(`/resident/messages/${msg.id}/archive`);
      load();
    } catch (err) {
      toastResError(t, err);
    }
  };

  return (
    <div className="res-messages-page">
      <div className="page-header">
        <Title size="middle" color="app-green">
          {t('res.messages.title')}
        </Title>
        <Tag color="app-yellow" variant="soft">
          {t('res.messages.unread', { count: unread })}
        </Tag>
      </div>

      <Tabs
        activeKey={archived}
        onChange={setArchived}
        items={[
          { key: '0', label: t('res.messages.inbox'), children: null },
          { key: '1', label: t('res.messages.archivedTab'), children: null },
        ]}
      />

      {items === null ? (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card type="dashed">
          <div className="res-empty">
            <InboxIcon size={32} />
            <p className="muted-text">{t('res.messages.empty')}</p>
          </div>
        </Card>
      ) : (
        <div className="res-msg-list">
          {items.map((msg) => (
            <Card key={msg.id} className={`res-msg-item${msg.read ? '' : ' unread'}`} onClick={() => markRead(msg)}>
              <div className="res-msg-head">
                <b>{msg.title}</b>
                <span className="muted-text">{fmtDateTime(msg.createdAt)}</span>
              </div>
              <p className="res-msg-body">{msg.body}</p>
              <div className="res-msg-actions">
                {!msg.read && (
                  <Tag color="app-yellow" variant="soft" size="small">
                    {t('res.messages.unreadTag')}
                  </Tag>
                )}
                {archived === '0' && (
                  <Button
                    type="text"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      archive(msg);
                    }}
                  >
                    {t('res.messages.archive')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
