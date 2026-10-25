import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Tag, Title } from 'animal-island-ui';
import { InboxIcon, MailIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { ImNav } from '../../components/immigration/shared.jsx';

const FILTERS = ['all', 'unread', 'archived'];

export default function ImmigrationMessages() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/immigration/messages?filter=${filter}&pageSize=50`)
      .then(setData)
      .catch((err) => {
        toastApiError(err);
        setData({ items: [], unreadCount: 0 });
      });
  }, [filter]);

  useEffect(load, [load]);

  const act = async (path) => {
    try {
      await api.post(path);
      load();
    } catch (err) {
      toastApiError(err);
    }
  };

  return (
    <div className="im-page">
      <ImNav />
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {t('imm.msg.title')}
        </Title>
        <Button type="text" size="small" onClick={() => act('/immigration/messages/read-all')} disabled={!data?.unreadCount}>
          {t('imm.msg.readAll')}
        </Button>
      </div>

      <div className="im-msg-filters">
        {FILTERS.map((f) => (
          <Button key={f} type={filter === f ? 'primary' : 'default'} size="small" onClick={() => setFilter(f)}>
            {t(`imm.msg.filter.${f}`)}
            {f === 'unread' && data?.unreadCount > 0 && (
              <Badge count={data.unreadCount} size="small" color="app-red" />
            )}
          </Button>
        ))}
      </div>

      <div className="im-msg-list">
        {(data?.items ?? []).map((m) => (
          <Card key={m.id} className={`im-msg-item${m.read ? '' : ' im-msg-unread'}`}>
            <div className="im-msg-head">
              {!m.read && <Badge dot color="app-red" />}
              <b>{m.title}</b>
              <span className="muted-text">{m.created_at?.slice(0, 16).replace('T', ' ')}</span>
              <Tag size="small">{t(`imm.msg.template.${m.templateCode}`, { defaultValue: m.templateCode })}</Tag>
            </div>
            <p className="im-ann-body">{m.body}</p>
            <div className="im-msg-actions">
              {!m.read && (
                <Button type="text" size="small" icon={<MailIcon />} onClick={() => act(`/immigration/messages/${m.id}/read`)}>
                  {t('imm.msg.markRead')}
                </Button>
              )}
              {filter === 'archived' ? (
                <Button type="text" size="small" icon={<InboxIcon />} onClick={() => act(`/immigration/messages/${m.id}/unarchive`)}>
                  {t('imm.msg.unarchive')}
                </Button>
              ) : (
                <Button type="text" size="small" onClick={() => act(`/immigration/messages/${m.id}/archive`)}>
                  {t('imm.msg.archive')}
                </Button>
              )}
            </div>
          </Card>
        ))}
        {data !== null && data.items.length === 0 && (
          <Card type="dashed">
            <p className="muted-text">{t('imm.msg.empty')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
