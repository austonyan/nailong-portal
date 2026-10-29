// 站内信:提交/受理/补件/处理完成/复核结果/决定书等通知,已读与归档。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { InboxIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { fmtDateTime, toastAppealError } from './shared.jsx';

export default function AppealMessages() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [archived, setArchived] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/appeal/messages${archived ? '?archived=1' : ''}`);
      setItems(data.items);
      setUnread(data.unread);
    } catch (err) {
      toastAppealError(t, err);
      setItems([]);
    }
  }, [archived, t]);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (m) => {
    try {
      if (!m.read) await api.post(`/appeal/messages/${m.id}/read`, {});
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const archive = async (m) => {
    try {
      await api.post(`/appeal/messages/${m.id}/archive`, {});
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const goTarget = (m) => {
    if (m.targetType === 'appeal' && m.targetId) navigate(`/appeal/appeals/${m.targetId}`);
    else if (m.targetType === 'review' && m.targetId) navigate('/appeal/reviews');
    else if (m.targetType === 'decision') navigate('/appeal/decisions');
    else if (m.targetType === 'complaint') navigate('/appeal/complaints');
    else if (m.targetType === 'ticket') navigate('/appeal/tickets');
  };

  return (
    <div className="appeal-list-page">
      <div className="page-header">
        <Title size="middle">
          {t('appeal.messages.title')}
          {unread > 0 && <Tag color="app-red" variant="soft">{t('appeal.messages.unread', { count: unread })}</Tag>}
        </Title>
        <div className="table-actions appeal-filter-bar">
          <Button onClick={() => setArchived(!archived)}>
            {archived ? t('appeal.messages.backToInbox') : t('appeal.messages.showArchived')}
          </Button>
        </div>
      </div>

      {items === null && (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      )}
      {items !== null && items.length === 0 && (
        <Card type="dashed" className="appeal-empty-card">
          <InboxIcon size={28} />
          <p className="muted-text">{t('common.empty')}</p>
        </Card>
      )}

      {(items ?? []).map((m) => (
        <Card key={m.id} className={`appeal-message-card ${m.read ? '' : 'unread'}`}>
          <div className="appeal-message-head">
            {!m.read && <span className="appeal-message-dot" />}
            <strong>{t(`appeal.msg.${m.type}.title`, { defaultValue: t('appeal.msg.system.title'), ...m.params })}</strong>
            <span className="muted-text appeal-notice-time">{fmtDateTime(m.createdAt)}</span>
          </div>
          <p className="muted-text">{t(`appeal.msg.${m.type}.body`, { defaultValue: t('appeal.msg.system.body'), ...m.params })}</p>
          <div className="table-actions appeal-message-actions">
            <Button type="text" size="small" onClick={() => goTarget(m)}>
              {t('appeal.messages.view')}
            </Button>
            {!m.read && (
              <Button type="text" size="small" onClick={() => markRead(m)}>
                {t('appeal.messages.markRead')}
              </Button>
            )}
            <Button type="text" size="small" onClick={() => archive(m)}>
              {t('appeal.messages.archive')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
