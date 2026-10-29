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
  const [offices, setOffices] = useState([]);
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
    // 重新拉取时先清空旧列表,否则「加载中…」下面还压着上一次的结果。
    setItems([]);
    try {
      const query = new URLSearchParams({ status, limit: '50' });
      if (office) query.set('office', office);
      const data = await api.get(`/messages?${query.toString()}`);
      setItems(data.items || []);
      // 署别筛选项来自服务端可访问信箱列表,不随当前筛选结果变化,
      // 否则选中某个署之后整排筛选器会消失、回不到「全部署」。
      if (Array.isArray(data.offices)) setOffices(data.offices);
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

  // read-all 是全局接口(当前页 50 条之外仍有未读也会被标已读),
  // 因此按 unread.total 判断能否点,并按接口回报的实际条数提示。
  const canMarkAll = (unread.total ?? 0) > 0;

  const markAll = async () => {
    setBusy(true);
    try {
      const data = await api.post('/messages/read-all', office ? { office } : {});
      const updated = Number(data?.updated ?? 0);
      toastSuccess(
        updated > 0
          ? t('inbox.markedCount', { count: updated })
          : t('inbox.nothingToMark')
      );
      await loadList();
      await loadUnread();
    } catch (err) {
      toastApiError(t, err);
    } finally {
      setBusy(false);
    }
  };

  // 署筛选标签按服务端可访问署生成(「全部署」常驻),避免出现空结果标签。
  const officeChips = useMemo(() => {
    const set = new Set(offices);
    if (office) set.add(office);
    return [...set];
  }, [offices, office]);

  // 筛选项用 Button(Tag 不透传 aria-pressed):原生 button 天然可键盘聚焦、
  // 回车触发,aria-pressed 让读屏能报出当前选中的筛选项。
  const filterChip = (label, selected, onSelect, key) => (
    <Button
      key={key}
      size="small"
      type={selected ? 'primary' : 'default'}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {label}
    </Button>
  );

  // Card 只是带 onClick 的 div,键盘不可达;补 role/tabIndex/Enter-Space
  // 让它成为真正的按钮,未读状态同时用文字播报而不只是色点。
  const openByKey = (event, item) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMessage(item);
    }
  };

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
              disabled={busy || !canMarkAll}
              onClick={markAll}
            >
              {office ? t('inbox.markAllOffice', { office: officeLabel(t, { office }) }) : t('inbox.markAll')}
            </Button>
          </div>
        }
      >
        <div className="inbox-toolbar">
          <div className="inbox-filters" role="group" aria-label={t('inbox.filterStatus')}>
            {filterChip(t('inbox.all'), status === 'all', () => setStatus('all'))}
            {filterChip(
              `${t('inbox.unread')}${unread.total > 0 ? ` ${unread.total}` : ''}`,
              status === 'unread',
              () => setStatus('unread'),
            )}
          </div>
          <div className="inbox-filters" role="group" aria-label={t('inbox.filterOffice')}>
            {filterChip(t('inbox.allOffices'), !office, () => setOffice(''))}
            {officeChips.map((key) =>
              filterChip(
                officeLabel(t, { office: key }),
                office === key,
                () => setOffice(office === key ? '' : key),
                key,
              ),
            )}
          </div>
        </div>

        {loading && <p className="muted-text inbox-hint">{t('common.loading')}</p>}
        {!loading && failed && (
          <p className="muted-text inbox-hint">
            {t('inbox.loadFailed')}
            <Button type="text" size="small" onClick={loadList}>{t('common.retry')}</Button>
          </p>
        )}
        {!loading && !failed && items.length === 0 && (
          <p className="muted-text inbox-hint">{t('inbox.empty')}</p>
        )}

        {!loading && !failed && items.length > 0 && (
          <div className="inbox-list">
            {items.map((item) => {
              const text = messageText(t, item);
              return (
                <Card
                  key={`${item.office}:${item.id}`}
                  className={`inbox-item${item.read ? '' : ' unread'}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${officeLabel(t, item)} · ${text.title} · ${t(item.read ? 'common.readState' : 'common.unreadState')}`}
                  onClick={() => openMessage(item)}
                  onKeyDown={(e) => openByKey(e, item)}
                >
                  <div className="inbox-item-head">
                    <Tag size="small" variant="soft" color="app-teal">{officeLabel(t, item)}</Tag>
                    {!item.read && <span className="inbox-dot" aria-hidden="true" />}
                    {!item.read && <span className="muted-text inbox-time">{t('common.unreadState')}</span>}
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
        )}
      </Drawer>
    </>
  );
}