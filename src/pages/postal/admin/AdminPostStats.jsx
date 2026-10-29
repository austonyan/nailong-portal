// 基础统计:消息量与已读率、明信片发送量、公告与订阅概览。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { sourceLabel, toastPostError } from '../shared.jsx';

function Stat({ label, value, sub }) {
  return (
    <Card>
      <div className="postal-stat">
        <span className="postal-stat-value">{value}</span>
        <span className="postal-stat-label">{label}</span>
        {sub ? <span className="postal-stat-label">{sub}</span> : null}
      </div>
    </Card>
  );
}

export default function AdminPostStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/postal/admin/stats')
      .then((data) => {
        if (alive) setStats(data);
      })
      .catch((err) => {
        if (alive) toastPostError(t, err);
      });
    return () => {
      alive = false;
    };
  }, [t]);

  if (!stats) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const sourceColumns = [
    {
      title: t('post.admin.stats.source'),
      dataIndex: 'source',
      render: (value) => sourceLabel(t, value),
    },
    { title: t('post.admin.stats.messageCount'), dataIndex: 'total' },
    { title: t('post.admin.stats.unreadCount'), dataIndex: 'unread' },
  ];

  return (
    <div className="postal-section">
      <div className="postal-section-head">
        <Title size="middle" color="app-blue">
          {t('post.admin.stats.title')}
        </Title>
      </div>

      <div className="postal-stat-grid">
        <Stat label={t('post.admin.stats.messageTotal')} value={stats.messages.total} />
        <Stat label={t('post.admin.stats.readRate')} value={`${stats.messages.readRate}%`} />
        <Stat label={t('post.admin.stats.unreadCount')} value={stats.messages.unread} />
        <Stat label={t('post.admin.stats.archivedCount')} value={stats.messages.archived} />
        <Stat label={t('post.admin.stats.postcardTotal')} value={stats.postcards.total} />
        <Stat label={t('post.admin.stats.postcardToday')} value={stats.postcards.today} />
        <Stat label={t('post.admin.stats.postcardReceived')} value={stats.postcards.received} />
        <Stat label={t('post.admin.stats.postcardTaken')} value={stats.postcards.takenDown} />
      </div>

      <div className="postal-stat-grid">
        <Stat
          label={t('post.admin.stats.noticesPublished')}
          value={stats.notices.published}
          sub={`${t('post.admin.stats.noticesDraft')}: ${stats.notices.draft} · ${t('post.admin.stats.noticesOffline')}: ${stats.notices.offline}`}
        />
        <Stat label={t('post.admin.stats.subscribers')} value={stats.subscribers} />
        <Stat
          label={t('post.admin.stats.templatesEnabled')}
          value={`${stats.templates.enabled} / ${stats.templates.total}`}
        />
      </div>

      <div className="postal-section">
        <Title size="middle" color="app-teal">
          {t('post.admin.stats.bySource')}
        </Title>
        <Card>
          <Table
            className="table-fit"
            columns={sourceColumns}
            dataSource={stats.bySource}
            rowKey="source"
            pagination={false}
            emptyText={t('common.empty')}
          />
        </Card>
      </div>

      <div className="postal-section">
        <Title size="middle" color="app-yellow">
          {t('post.admin.stats.byType')}
        </Title>
        <Card>
          <div className="postal-notice-list">
            {stats.byType.map((row) => (
              <div key={row.type} className="postal-recipient-item">
                <div>
                  <div className="postal-recipient-name">
                    {t(`post.msg.${row.type}.title`, { defaultValue: t('common.unknown') })}
                  </div>
                </div>
                <Tag color="app-blue" variant="soft">
                  {row.total}
                </Tag>
              </div>
            ))}
          </div>
          {stats.byType.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        </Card>
      </div>
    </div>
  );
}