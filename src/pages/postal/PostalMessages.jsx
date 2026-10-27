// 消息中心:全部/未读/已读、归档、按署筛选、关键词搜索与批量已读/归档。
// 消息正文由 post.msg.<type> 渲染(管理端启用模板时优先用模板渲染结果)。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Pagination, Select, Tabs, Tag, Title } from 'animal-island-ui';
import { BellIcon, FolderPlusIcon, InboxIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { toastSuccess } from '../../components/toast.js';
import { fmtDateTime, messageBody, messageTitle, sourceLabel, toastPostError } from './shared.jsx';

const PAGE_SIZE = 20;

export default function PostalMessages() {
  const { t, i18n } = useTranslation();
  const [box, setBox] = useState('inbox');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ box, page: String(page), pageSize: String(PAGE_SIZE), status });
      if (source) params.set('source', source);
      if (query) params.set('q', query);
      const result = await api.get(`/postal/messages?${params.toString()}`);
      setData(result);
    } catch (err) {
      toastPostError(t, err);
      setData({ items: [], total: 0, unread: 0, sources: [] });
    }
  }, [box, page, query, source, status, t]);

  useEffect(() => {
    setSelected([]);
    load();
  }, [load]);

  const sourceOptions = useMemo(() => {
    const rows = data?.sources ?? [];
    return [
      { key: '', label: t('post.messages.allSources') },
      ...rows.map((row) => ({
        key: row.source,
        label: `${sourceLabel(t, row.source)} (${row.total})`,
      })),
    ];
  }, [data?.sources, t]);

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const bulk = async (action) => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const result = await api.post('/postal/messages/bulk', { action, ids: selected });
      setSelected([]);
      toastSuccess(t('post.messages.bulkDone', { count: result.updated ?? selected.length }));
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (msg, read) => {
    try {
      await api.post(`/postal/messages/${msg.id}/${read ? 'read' : 'unread'}`);
      load();
    } catch (err) {
      toastPostError(t, err);
    }
  };

  const archiveOne = async (msg) => {
    try {
      await api.post(`/postal/messages/${msg.id}/${box === 'inbox' ? 'archive' : 'unarchive'}`);
      load();
    } catch (err) {
      toastPostError(t, err);
    }
  };

  const runAll = async (path, doneMessage) => {
    setBusy(true);
    try {
      await api.post(path);
      toastSuccess(doneMessage);
      setSelected([]);
      await load();
    } catch (err) {
      toastPostError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const items = data?.items ?? [];

  // 页签内容:两个箱共用同一渲染(数据随 box 状态切换),挂在 Tabs 的
  // children 里,避免页签框外浮着一块孤儿内容。
  const messagePane = (
    <>
      <div className="postal-filter-bar">
        <Select
          value={status}
          onChange={(key) => {
            setStatus(key);
            setPage(1);
          }}
          options={[
            { key: 'all', label: t('post.messages.statusAll') },
            { key: 'unread', label: t('post.messages.statusUnread') },
            { key: 'read', label: t('post.messages.statusRead') },
          ]}
        />
        <Select
          value={source}
          onChange={(key) => {
            setSource(key);
            setPage(1);
          }}
          options={sourceOptions}
        />
        <Input
          size="middle"
          allowClear
          value={keyword}
          placeholder={t('post.messages.searchPlaceholder')}
          onChange={(e) => setKeyword(e.target.value)}
          onClear={() => {
            setKeyword('');
            setQuery('');
            setPage(1);
          }}
        />
        <Button
          icon={<SearchIcon />}
          onClick={() => {
            setQuery(keyword.trim());
            setPage(1);
          }}
        >
          {t('common.search')}
        </Button>
      </div>

      <div className="postal-filter-bar">
        <Button
          size="small"
          loading={busy}
          disabled={busy || !selected.length}
          onClick={() => bulk('read')}
        >
          {t('post.messages.bulkRead', { count: selected.length })}
        </Button>
        <Button
          size="small"
          loading={busy}
          disabled={busy || !selected.length}
          onClick={() => bulk('archive')}
        >
          {t('post.messages.bulkArchive', { count: selected.length })}
        </Button>
        <Button
          type="text"
          size="small"
          icon={<InboxIcon />}
          disabled={busy}
          onClick={() => runAll('/postal/messages/read-all', t('post.messages.readAllDone'))}
        >
          {t('post.messages.readAll')}
        </Button>
        <Button
          type="text"
          size="small"
          icon={<FolderPlusIcon />}
          disabled={busy}
          onClick={() => runAll('/postal/messages/archive-all', t('post.messages.archiveAllDone'))}
        >
          {t('post.messages.archiveAll')}
        </Button>
      </div>

      {data === null ? (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card type="dashed">
          <div className="postal-empty">
            <BellIcon size={30} />
            <p className="muted-text">{t('post.messages.empty')}</p>
          </div>
        </Card>
      ) : (
        <div className="postal-msg-list">
          {items.map((msg) => {
            const isSelected = selected.includes(msg.id);
            return (
              <Card key={msg.id} className={`postal-msg-item${msg.read ? '' : ' unread'}`}>
                <div className="postal-msg-head">
                  <div className="postal-msg-actions">
                    <Tag
                      color={isSelected ? 'app-teal' : 'default'}
                      variant="soft"
                      size="small"
                      onClick={() => toggleSelect(msg.id)}
                    >
                      {isSelected ? t('post.messages.selected') : t('post.messages.select')}
                    </Tag>
                    <Tag color="app-blue" variant="soft" size="small">
                      {sourceLabel(t, msg.source)}
                    </Tag>
                    <b>{messageTitle(t, i18n, msg)}</b>
                  </div>
                  <span className="muted-text">{fmtDateTime(msg.createdAt)}</span>
                </div>
                <p className="postal-msg-body">{messageBody(t, i18n, msg)}</p>
                <div className="postal-msg-actions">
                  {!msg.read && (
                    <Tag color="app-yellow" variant="soft" size="small">
                      {t('post.messages.unreadTag')}
                    </Tag>
                  )}
                  <Button type="text" size="small" onClick={() => markOne(msg, !msg.read)}>
                    {msg.read ? t('post.messages.markUnread') : t('post.messages.markRead')}
                  </Button>
                  <Button type="text" size="small" onClick={() => archiveOne(msg)}>
                    {box === 'inbox' ? t('post.messages.archive') : t('post.messages.unarchive')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(data?.total ?? 0) > PAGE_SIZE && (
        <Pagination total={data.total} current={page} pageSize={PAGE_SIZE} onChange={setPage} showTotal />
      )}
    </>
  );

  return (
    <div className="postal-section">
      <div className="postal-section-head">
        <Title size="middle" color="app-blue">
          {t('post.messages.title')}
        </Title>
        <Tag color="app-yellow" variant="soft">
          {t('post.messages.unread', { count: data?.unread ?? 0 })}
        </Tag>
      </div>

      <Tabs
        activeKey={box}
        onChange={(key) => {
          setBox(key);
          setPage(1);
        }}
        items={[
          { key: 'inbox', label: t('post.messages.inbox'), children: messagePane },
          { key: 'archived', label: t('post.messages.archivedTab'), children: messagePane },
        ]}
      />
    </div>
  );
}