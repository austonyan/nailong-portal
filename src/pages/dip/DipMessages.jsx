// 站内信: 提交成功 / 补件 / 建交通过 / 驳回 / 身份通过 / 协议生效 / 断交通知。
// 支持已读/未读、归档。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { FolderIcon, CheckIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { DipNav, fmtDateTime, toastDipError } from '../../components/dip/shared.jsx';

const FILTERS = ['all', 'unread', 'archived'];

export default function DipMessages() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/dip/messages?filter=${filter}&pageSize=50`)
      .then(setData)
      .catch((err) => {
        toastDipError(t, err);
        setData({ items: [], unreadCount: 0 });
      });
  }, [filter, t]);

  useEffect(load, [load]);

  const markRead = async (id) => {
    try {
      await api.post(`/dip/messages/${id}/read`);
      load();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const markAll = async () => {
    try {
      await api.post('/dip/messages/read-all');
      load();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  const archive = async (m) => {
    try {
      await api.post(`/dip/messages/${m.id}/${filter === 'archived' ? 'unarchive' : 'archive'}`);
      load();
    } catch (err) {
      toastDipError(t, err);
    }
  };

  return (
    <div className="dip-page">
      <DipNav />
      <div className="page-header">
        <Title size="middle" color="purple">{t('dip.messages.title')}</Title>
        {data?.unreadCount > 0 && <Tag color="app-red" variant="soft">{t('dip.messages.unreadCount', { count: data.unreadCount })}</Tag>}
        <Button type="default" size="small" icon={<CheckIcon />} onClick={markAll}>{t('dip.messages.readAll')}</Button>
      </div>

      <div className="dip-msg-filter">
        {FILTERS.map((f) => (
          <Button key={f} type={filter === f ? 'primary' : 'default'} size="small" onClick={() => setFilter(f)}>
            {t(`dip.messages.filter_${f}`)}
          </Button>
        ))}
      </div>

      <div className="dip-msg-list">
        {(data?.items ?? []).map((m) => (
          <Card key={m.id} className={`dip-msg-item${m.read ? '' : ' dip-msg-unread'}`}>
            <div className="dip-msg-head">
              {!m.read && <Tag size="small" color="app-red" variant="soft">{t('dip.messages.unread')}</Tag>}
              <b>{m.title}</b>
              <span className="muted-text">{fmtDateTime(m.createdAt)}</span>
            </div>
            <p className="dip-msg-body">{m.body}</p>
            <div className="dip-msg-actions">
              {!m.read && (
                <Button type="text" size="small" icon={<CheckIcon />} onClick={() => markRead(m.id)}>
                  {t('dip.messages.markRead')}
                </Button>
              )}
              {filter !== 'archived' ? (
                <Button type="text" size="small" icon={<FolderIcon />} onClick={() => archive(m)}>
                  {t('dip.messages.archive')}
                </Button>
              ) : (
                <Button type="text" size="small" onClick={() => archive(m)}>{t('dip.messages.unarchive')}</Button>
              )}
            </div>
          </Card>
        ))}
        {(data?.items ?? []).length === 0 && (
          <Card><p className="muted-text">{t('common.empty')}</p></Card>
        )}
      </div>
    </div>
  );
}
