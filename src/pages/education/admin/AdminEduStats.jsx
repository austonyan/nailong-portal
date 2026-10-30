// 基础统计(edu:manage):阅读量、收藏量、内容状态分布与任务完成率。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../../api/client.js';
import { StatusTag, toastEduError } from '../shared.jsx';

export default function AdminEduStats() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/education/admin/stats')
      .then((res) => !cancelled && setData(res))
      .catch((err) => {
        toastEduError(t, err);
        if (!cancelled) setData({ entries: {}, articles: {}, reads: {}, favorites: {}, badges: 0, pendingReview: 0, tasks: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (!data) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const overview = [
    { label: t('edu.admin.stats.reads'), value: data.reads?.total ?? 0 },
    { label: t('edu.admin.stats.readsToday'), value: data.reads?.today ?? 0 },
    { label: t('edu.admin.stats.readers'), value: data.reads?.readers ?? 0 },
    { label: t('edu.admin.stats.favorites'), value: data.favorites?.total ?? 0 },
    { label: t('edu.admin.stats.badges'), value: data.badges ?? 0 },
    { label: t('edu.admin.stats.pendingReview'), value: data.pendingReview ?? 0 },
  ];

  const contentColumns = [
    { title: t('common.status'), dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
    { title: t('edu.admin.stats.entriesCol'), dataIndex: 'entries' },
    { title: t('edu.admin.stats.articlesCol'), dataIndex: 'articles' },
  ];
  const contentRows = ['draft', 'pending_review', 'published', 'offline'].map((status) => ({
    status,
    entries: data.entries?.[status] ?? 0,
    articles: data.articles?.[status] ?? 0,
  }));

  const taskColumns = [
    { title: t('edu.field.title'), dataIndex: 'title' },
    { title: t('edu.field.code'), dataIndex: 'code', width: 110 },
    {
      title: t('common.status'),
      dataIndex: 'status',
      width: 100,
      render: (v) => <StatusTag value={v} prefix="edu.admin.taskStatus" />,
    },
    { title: t('edu.admin.tasks.participants'), dataIndex: 'participants', width: 100 },
    { title: t('edu.admin.tasks.completedCol'), dataIndex: 'completed', width: 100 },
    {
      title: t('edu.admin.tasks.completionRate'),
      dataIndex: 'completionRate',
      width: 110,
      render: (v) => (
        <Tag size="small" color={v >= 100 ? 'app-green' : 'app-blue'} variant="soft">
          {v}%
        </Tag>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-teal">
            {t('edu.admin.stats.title')}
          </Title>
        </h1>
      </div>

      <div className="edu-stat-grid">
        {overview.map((item) => (
          <Card key={item.label} className="edu-stat-card">
            <span className="edu-stat-value">{item.value}</span>
            <span className="edu-stat-label">{item.label}</span>
          </Card>
        ))}
      </div>

      <Card>
        <Title size="small">{t('edu.admin.stats.contentTitle')}</Title>
        <Table
          className="table-fit"
          columns={contentColumns}
          dataSource={contentRows}
          rowKey="status"
          pagination={false}
          emptyText={t('common.empty')}
        />
      </Card>

      <Card>
        <Title size="small">{t('edu.admin.stats.tasksTitle')}</Title>
        <Table
          className="table-fit"
          columns={taskColumns}
          dataSource={data.tasks ?? []}
          rowKey="id"
          pagination={false}
          emptyText={t('edu.admin.tasks.empty')}
        />
      </Card>
    </div>
  );
}
