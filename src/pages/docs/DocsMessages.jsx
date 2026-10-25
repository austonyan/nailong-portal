import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Notification, Pagination, Select, Tag, Title } from 'animal-island-ui';
import {
  AlertCircleIcon,
  BellIcon,
  CheckCircleIcon,
  ClockIcon,
  InboxIcon,
  SendIcon,
  XCircleIcon,
} from 'naive-icons';
import { api } from '../../api/client.js';
import { DOCS_MSG_REFRESH } from './DocsLayout.jsx';

const MSG_ICONS = {
  submitted: SendIcon,
  supplement_request: AlertCircleIcon,
  supplemented: SendIcon,
  approved: CheckCircleIcon,
  rejected: XCircleIcon,
  withdrawn: XCircleIcon,
  closed: XCircleIcon,
  expired: ClockIcon,
  expiry_reminder: BellIcon,
  revoked: XCircleIcon,
  regenerated: CheckCircleIcon,
};

export default function DocsMessages() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [box, setBox] = useState('inbox');
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/docs/messages?box=${box}&page=${page}&pageSize=${pageSize}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
      setItems([]);
    }
  }, [box, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const ping = () => window.dispatchEvent(new Event(DOCS_MSG_REFRESH));

  const markRead = async (m) => {
    if (m.read) return;
    try {
      await api.post(`/docs/messages/${m.id}/read`);
      ping();
      load();
    } catch {
      /* ignore */
    }
  };

  const readAll = async () => {
    try {
      await api.post('/docs/messages/read-all');
      ping();
      load();
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  const toggleArchive = async (m) => {
    try {
      await api.post(`/docs/messages/${m.id}/${m.archived ? 'unarchive' : 'archive'}`);
      ping();
      load();
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  return (
    <div>
      <div className="page-header">
        <Title size="middle">{t('docs.msg.title')}</Title>
        <div className="table-actions">
          <Select
            value={box}
            onChange={(v) => {
              setBox(v);
              setPage(1);
            }}
            options={[
              { key: 'inbox', label: t('docs.msg.inbox') },
              { key: 'archived', label: t('docs.msg.archived') },
            ]}
          />
          {box === 'archived' && (
            <Button
              onClick={() => {
                setBox('inbox');
                setPage(1);
              }}
              icon={<InboxIcon />}
            >
              {t('docs.msg.backInbox')}
            </Button>
          )}
          <Button onClick={readAll}>{t('docs.msg.readAll')}</Button>
        </div>
      </div>

      {items === null ? (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card type="dashed">
          <p className="muted-text">{t('docs.msg.empty')}</p>
        </Card>
      ) : (
        <div className="docs-msg-list">
          {items.map((m) => {
            const Icon = MSG_ICONS[m.type] || BellIcon;
            return (
              <Card
                key={m.id}
                className={m.read ? 'docs-msg-item' : 'docs-msg-item unread'}
                hoverable
                onClick={() => {
                  markRead(m);
                  if (m.applicationId) navigate(`/docs/applications/${m.applicationId}`);
                }}
              >
                <span className="docs-msg-icon">
                  <Badge dot={!m.read} color="app-red">
                    <Icon size={22} />
                  </Badge>
                </span>
                <div className="docs-msg-body">
                  <strong>{t(`docMsg.${m.type}.title`, { ...m.params, defaultValue: t('docMsg.system.title') })}</strong>
                  <p className="muted-text">
                    {t(`docMsg.${m.type}.body`, {
                      ...m.params,
                      // 驳回/撤销的参数里是原因码,渲染前先翻译
                      reason: m.params?.reasonCode ? t(`docs.reason.${m.params.reasonCode}`, { defaultValue: m.params.reasonCode }) : m.params?.reason,
                      defaultValue: '',
                    })}
                  </p>
                  <span className="docs-msg-time muted-text">{String(m.createdAt).slice(0, 16).replace('T', ' ')}</span>
                </div>
                <Button
                  size="small"
                  type="text"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleArchive(m);
                  }}
                >
                  {m.archived ? t('docs.msg.unarchive') : t('docs.msg.archive')}
                </Button>
              </Card>
            );
          })}
        </div>
      )}
      {total > pageSize && (
        <div className="docs-pagination">
          <Pagination total={total} current={page} pageSize={pageSize} onChange={setPage} showTotal />
        </div>
      )}
      <p className="muted-text docs-msg-foot">
        <Tag size="small" variant="soft">
          {t('docs.msg.tipTag')}
        </Tag>
        {t('docs.msg.tip')}
      </p>
    </div>
  );
}
