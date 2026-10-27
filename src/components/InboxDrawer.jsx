// 顶栏站内信:铃铛未读角标 + 跨署聚合抽屉。
// 聚合只读各署现有信箱表,标记已读回写原表,和各署站内信页面状态一致。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Badge, Button, Card, Drawer, Tag } from 'animal-island-ui';
import { BellIcon } from 'naive-icons';
import { api } from '../api/client.js';
import { toastApiError, toastSuccess } from './toast.js';
import { OFFICE_NAV } from '../nav/navConfig.js';

const POLL_MS = 60000;

// 各署信箱页(文旅/教育/统计的消息落在邮政表里,统一去邮政信箱)。
const OFFICE_INBOX = {
  visa: '/visa/messages',
  immigration: '/immigration/messages',
  dip: '/dip/messages',
  resident: '/resident/messages',
  protocol: '/protocol/messages',
  docs: '/docs/messages',
  appeal: '/appeal/messages',
  archives: '/archives/messages',
  postal: '/postal/messages',
};

// 内容形态:入境/外交/居民/礼宾由服务端直接给 title/body;其余按各署现有词条渲染。
const MESSAGE_KEYS = {
  visa: { prefix: 'visa.msg.', fallback: 'visa.msg.system' },
  docs: { prefix: 'docMsg.', fallback: 'docMsg.system' },
  appeal: { prefix: 'appeal.msg.', fallback: 'appeal.msg.system' },
  archives: { prefix: 'arch.msg.', fallback: null },
  postal: { prefix: 'post.msg.', fallback: 'post.msg.fallback' },
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function messageParams(params) {
  if (!params || typeof params !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = typeof value === 'string' && ISO_DATE.test(value)
      ? dayjs(value).format('YYYY-MM-DD HH:mm')
      : value;
  }
  return out;
}

function messageText(t, item) {
  if (item.title) return { title: item.title, body: item.body || '' };
  const map = MESSAGE_KEYS[item.office];
  if (!map) return { title: t('inbox.fallbackTitle'), body: t('inbox.fallbackBody') };
  const params = messageParams(item.params);
  return {
    title: t(`${map.prefix}${item.type}.title`, {
      ...params,
      defaultValue: map.fallback ? t(`${map.fallback}.title`) : t('inbox.fallbackTitle'),
    }),
    body: t(`${map.prefix}${item.type}.body`, {
      ...params,
      defaultValue: map.fallback ? '' : t('inbox.fallbackBody'),
    }),
  };
}

function officeLabel(t, item) {
  if (item.office === 'postal' && item.source && item.source !== 'postal') {
    return t(`post.source.${item.source}`, { defaultValue: t('nav.postal') });
  }
  const office = OFFICE_NAV.find((entry) => entry.key === item.office);
  return office ? t(office.labelKey) : item.office;
}

export default function InboxDrawer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('all');
  const [office, setOffice] = useState('');
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState({ total: 0, byOffice: [] });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadUnread = useCallback(async () => {
    try {
      const data = await api.get('/messages/unread');
      setUnread({ total: data.total || 0, byOffice: data.byOffice || [] });
    } catch {
      // 顶栏角标失败不打断页面,下一次轮询会重试
    }
  }, []);

  useEffect(() => {
    loadUnread();
    const timer = setInterval(loadUnread, POLL_MS);
    return () => clearInterval(timer);
  }, [loadUnread]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const query = new URLSearchParams({ status, limit: '50' });
      if (office) query.set('office', office);
      const data = await api.get(`/messages?${query.toString()}`);
      setItems(data.items || []);
      if (data.unread) setUnread({ total: data.unread.total || 0, byOffice: data.unread.byOffice || [] });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [status, office]);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  const close = () => setOpen(false);

  const openMessage = async (item) => {
    if (!item.read) {
      try {
        await api.post('/messages/read', { office: item.office, id: item.id });
        loadUnread();
      } catch {
        // 跳转优先,已读回写失败不阻断
      }
    }
    setOpen(false);
    navigate(OFFICE_INBOX[item.office] || '/');
  };

  const markAll = async () => {
    setBusy(true);
    try {
      await api.post('/messages/read-all', office ? { office } : {});
      toastSuccess(t('inbox.markedAll'));
      await loadList();
      await loadUnread();
    } catch (err) {
      toastApiError(t, err);
    } finally {
      setBusy(false);
    }
  };

  // 署筛选标签按当前列表里出现的署生成,避免出现空结果标签。
  const officeChips = useMemo(() => {
    const set = new Set(items.map((item) => item.office));
    if (office) set.add(office);
    return [...set];
  }, [items, office]);

  const hasUnread = items.some((item) => !item.read);

  return (
    <>
      <Badge count={unread.total || 0} size="small">
        <Button
          type="text"
          size="small"
          icon={<BellIcon />}
          onClick={() => setOpen(true)}
          aria-label={t('inbox.open')}
        />
      </Badge>

      <Drawer
        open={open}
        title={t('inbox.title')}
        placement="right"
        width="min(440px, 100vw)"
        maskClosable={false}
        pushBackground={false}
        onClose={close}
        footer={
          <div className="form-actions">
            <Button type="default" onClick={close} disabled={busy}>{t('common.close')}</Button>
            <Button
              type="primary"
              loading={busy}
              disabled={busy || !hasUnread}
              onClick={markAll}
            >
              {t('inbox.markAll')}
            </Button>
          </div>
        }
      >
        <div className="inbox-toolbar">
          <div className="inbox-filters">
            <Tag
              size="small"
              variant={status === 'all' ? 'solid' : 'soft'}
              color="app-teal"
              onClick={() => setStatus('all')}
            >
              {t('inbox.all')}
            </Tag>
            <Tag
              size="small"
              variant={status === 'unread' ? 'solid' : 'soft'}
              color="app-teal"
              onClick={() => setStatus('unread')}
            >
              {t('inbox.unread')}
              {unread.total > 0 ? ` ${unread.total}` : ''}
            </Tag>
          </div>
          {officeChips.length > 1 && (
            <div className="inbox-filters">
              <Tag
                size="small"
                variant={office ? 'outlined' : 'solid'}
                onClick={() => setOffice('')}
              >
                {t('inbox.allOffices')}
              </Tag>
              {officeChips.map((key) => (
                <Tag
                  key={key}
                  size="small"
                  variant={office === key ? 'solid' : 'outlined'}
                  onClick={() => setOffice(office === key ? '' : key)}
                >
                  {officeLabel(t, { office: key })}
                </Tag>
              ))}
            </div>
          )}
        </div>

        {loading && <p className="muted-text inbox-hint">{t('common.loading')}</p>}
        {!loading && failed && <p className="muted-text inbox-hint">{t('inbox.loadFailed')}</p>}
        {!loading && !failed && items.length === 0 && (
          <p className="muted-text inbox-hint">{t('inbox.empty')}</p>
        )}

        <div className="inbox-list">
          {items.map((item) => {
            const text = messageText(t, item);
            return (
              <Card
                key={`${item.office}:${item.id}`}
                className={`inbox-item${item.read ? '' : ' unread'}`}
                onClick={() => openMessage(item)}
              >
                <div className="inbox-item-head">
                  <Tag size="small" variant="soft" color="app-teal">{officeLabel(t, item)}</Tag>
                  {!item.read && <span className="inbox-dot" aria-hidden="true" />}
                  <span className="muted-text inbox-time">
                    {item.createdAt ? dayjs(item.createdAt).format('YYYY-MM-DD HH:mm') : ''}
                  </span>
                </div>
                <div className="inbox-item-title">{text.title}</div>
                {text.body && <p className="inbox-item-body">{text.body}</p>}
              </Card>
            );
          })}
        </div>
      </Drawer>
    </>
  );
}