import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Tag, Title } from 'animal-island-ui';
import { InboxIcon, MailIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastApiError } from '../../components/immigration/apiError.js';
import { ImNav } from '../../components/immigration/shared.jsx';
import { fmtDateTime } from '../../lib/date.js';

const FILTERS = ['all', 'unread', 'archived'];

export default function ImmigrationMessages() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState(null); // 正在处理的那一行('all' 或消息 id)

  const load = useCallback(() => {
    return api
      .get(`/immigration/messages?filter=${filter}&pageSize=50`)
      .then(setData)
      .catch((err) => {
        toastApiError(err);
        setData({ items: [], unreadCount: 0 });
      });
  }, [filter]);

  useEffect(load, [load]);

  // 标记已读/归档都是写操作:没有 busy 的话连点会重复请求,
  // 而且前一次的 load() 回来后列表会闪回旧状态。
  const act = async (path, id) => {
    if (busy) return;
    setBusy(true);
    setPendingId(id);
    try {
      await api.post(path);
      await load();
    } catch (err) {
      toastApiError(err);
    } finally {
      setBusy(false);
      setPendingId(null);
    }
  };

  return (
    <div className="im-page">
      <ImNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('imm.msg.title')}
          </Title>
        </h1>
        <Button
          type="text"
          size="small"
          onClick={() => act('/immigration/messages/read-all', 'all')}
          loading={busy && pendingId === 'all'}
          disabled={busy || !data?.unreadCount}
        >
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
        {data === null && (
          <Card type="dashed">
            <p className="muted-text">{t('common.loading')}</p>
          </Card>
        )}
        {(data?.items ?? []).map((m) => (
          <Card key={m.id} className={`im-msg-item${m.read ? '' : ' im-msg-unread'}`}>
            <div className="im-msg-head">
              {!m.read && <Badge dot color="app-red" />}
              <b>{m.title}</b>
              <span className="muted-text">{fmtDateTime(m.created_at)}</span>
              <Tag size="small" color="app-blue" variant="soft">{t(`imm.msg.template.${m.templateCode}`, { defaultValue: t('common.unknown') })}</Tag>
            </div>
            <p className="im-ann-body">{m.body}</p>
            <div className="im-msg-actions">
              {!m.read && (
                <Button
                  type="text"
                  size="small"
                  icon={<MailIcon />}
                  onClick={() => act(`/immigration/messages/${m.id}/read`, m.id)}
                  loading={busy && pendingId === m.id}
                  disabled={busy}
                >
                  {t('imm.msg.markRead')}
                </Button>
              )}
              {filter === 'archived' ? (
                <Button
                  type="text"
                  size="small"
                  icon={<InboxIcon />}
                  onClick={() => act(`/immigration/messages/${m.id}/unarchive`, m.id)}
                  loading={busy && pendingId === m.id}
                  disabled={busy}
                >
                  {t('imm.msg.unarchive')}
                </Button>
              ) : (
                <Button
                  type="text"
                  size="small"
                  onClick={() => act(`/immigration/messages/${m.id}/archive`, m.id)}
                  loading={busy && pendingId === m.id}
                  disabled={busy}
                >
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
