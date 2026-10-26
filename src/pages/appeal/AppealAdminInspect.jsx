// 监察与审核质量(只读):时效监控、异常操作检测、结果一致性、抽查预留、监察报告。
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Modal, Select, Table, Tag, Title } from 'animal-island-ui';
import { api } from '../../api/client.js';
import { TextArea, fmtDateTime, toastAppealError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

export default function AppealAdminInspect() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [reports, setReports] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('quality');
  const [content, setContent] = useState('');
  const [sampleBiz, setSampleBiz] = useState('visa');
  const [sampleResult, setSampleResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r, p] = await Promise.all([
        api.get('/appeal/admin/inspect/summary'),
        api.get('/appeal/admin/inspect/records?limit=50'),
        api.get('/appeal/admin/inspect/reports'),
      ]);
      setSummary(s);
      setRecords(r.items);
      setReports(p.items);
    } catch (err) {
      toastAppealError(t, err);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const doCreate = async () => {
    setBusy(true);
    try {
      await api.post('/appeal/admin/inspect/reports', { title, kind, content });
      toastSuccess(t('common.saved'));
      setCreateOpen(false);
      setTitle('');
      setContent('');
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const doSample = async () => {
    try {
      const data = await api.post('/appeal/admin/inspect/sampling', { bizType: sampleBiz, note: t('appeal.inspect.sampleNote') });
      setSampleResult(data.sample);
      toastSuccess(t('appeal.inspect.sampleDone', { count: data.sample?.items?.length ?? 0 }));
      await load();
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const recordColumns = [
    { title: t('appeal.inspect.colTarget'), width: 140, render: (_v, r) => `${t(`appeal.ownerType.${r.target_type}`)} #${r.target_id}` },
    { title: t('appeal.inspect.colAction'), dataIndex: 'action', width: 160 },
    { title: t('appeal.inspect.colActor'), dataIndex: 'actor_name', width: 140 },
    { title: t('appeal.inspect.colComment'), dataIndex: 'comment' },
    { title: t('appeal.inspect.colTime'), dataIndex: 'created_at', width: 150, render: fmtDateTime },
  ];

  return (
    <div className="appeal-admin-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.inspect.title')}</Title>
        <div className="table-actions appeal-filter-bar">
          <Button onClick={() => setCreateOpen(true)}>{t('appeal.inspect.createReport')}</Button>
        </div>
      </div>

      {!summary && (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      )}

      {summary && (
        <>
          <Card className="appeal-inspect-card">
            <h4>{t('appeal.inspect.slaTitle')}</h4>
            <div className="appeal-stat-grid">
              <div className="appeal-stat-item">
                <strong>{summary.avgAcceptHours}h</strong>
                <span>{t('appeal.inspect.avgAccept')}</span>
              </div>
              <div className="appeal-stat-item">
                <strong>{summary.avgResolveDays}d</strong>
                <span>{t('appeal.inspect.avgResolve')}</span>
              </div>
              <div className="appeal-stat-item">
                <strong>{summary.acceptOverdue}</strong>
                <span>{t('appeal.inspect.acceptOverdue')}</span>
              </div>
              <div className="appeal-stat-item">
                <strong>{summary.resolveOverdue}</strong>
                <span>{t('appeal.inspect.resolveOverdue')}</span>
              </div>
              <div className="appeal-stat-item">
                <strong>{summary.satisfaction ?? '-'}</strong>
                <span>{t('appeal.inspect.satisfaction')}</span>
              </div>
            </div>
            <p className="muted-text">{t('appeal.inspect.slaHint', { accept: summary.acceptSlaHours, resolve: summary.resolveSlaHours })}</p>
          </Card>

          <Card className="appeal-inspect-card">
            <h4>{t('appeal.inspect.anomalyTitle')}</h4>
            {summary.anomalies.highFrequency.length === 0 ? (
              <p className="muted-text">{t('appeal.inspect.noHighFrequency')}</p>
            ) : (
              <ul className="appeal-list">
                {summary.anomalies.highFrequency.map((h) => (
                  <li key={h.actor_name}>
                    <Tag color="app-orange" variant="soft">{h.actor_name}</Tag>
                    {t('appeal.inspect.highFrequency', { count: h.n })}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted-text">{t('appeal.inspect.nightOps', { count: summary.anomalies.nightOps })}</p>
          </Card>

          <Card className="appeal-inspect-card">
            <h4>{t('appeal.inspect.consistencyTitle')}</h4>
            <div className="appeal-dist-row">
              {summary.decisionDistribution.map((d) => (
                <Tag key={d.type} variant="soft" color="app-blue">
                  {t(`appeal.decisionType.${d.type}`)}: {d.n}
                </Tag>
              ))}
            </div>
            <div className="appeal-dist-row">
              {summary.bizDistribution.map((d) => (
                <Tag key={d.type} variant="outlined">
                  {t(`appeal.bizType.${d.type}`)}: {d.n}
                </Tag>
              ))}
            </div>
          </Card>

          <Card className="appeal-inspect-card">
            <h4>{t('appeal.inspect.integrationTitle')}</h4>
            <p className="muted-text">{t('appeal.inspect.integrationLive')}</p>
            <div className="appeal-dist-row">
              {summary.integration.map((i) => (
                <Tag key={i.bizType} variant="soft" color={i.integrated ? 'app-green' : 'default'}>
                  {t(`appeal.bizType.${i.bizType}`)} · {i.integrated ? t('appeal.inspect.integrated') : t('appeal.inspect.reserved')}
                </Tag>
              ))}
            </div>
            <div className="table-actions appeal-filter-bar">
              <Select value={sampleBiz} onChange={setSampleBiz} options={summary.integration.map((i) => ({ key: i.bizType, label: t(`appeal.bizType.${i.bizType}`) }))} />
              <Button onClick={doSample}>{t('appeal.inspect.sample')}</Button>
            </div>
            {sampleResult && (
              <div className="appeal-sample-result">
                <p className="muted-text">
                  {t('appeal.inspect.sampleSummary', {
                    office: sampleResult.office,
                    total: sampleResult.total,
                    count: sampleResult.items.length,
                  })}
                </p>
                <div className="appeal-dist-row">
                  {sampleResult.byStatus.map((s) => (
                    <Tag key={s.status} variant="outlined" size="small">
                      {s.status}: {s.n}
                    </Tag>
                  ))}
                </div>
                <ul className="appeal-list">
                  {sampleResult.items.map((s) => (
                    <li key={s.code}>
                      <b>{s.code}</b>
                      <span className="muted-text"> · {s.title} · {s.status} · {fmtDateTime(s.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="appeal-inspect-card">
            <h4>{t('appeal.inspect.reportsTitle')}</h4>
            {reports.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
            <ul className="appeal-list">
              {reports.map((r) => (
                <li key={r.id}>
                  <Tag variant="soft" color={r.kind === 'anomaly' ? 'app-red' : r.kind === 'consistency' ? 'app-blue' : 'app-green'}>
                    {t(`appeal.inspect.kind.${r.kind}`)}
                  </Tag>
                  <strong>{r.title}</strong>
                  <span className="muted-text"> {r.created_by} · {fmtDateTime(r.created_at)}</span>
                  <p className="muted-text appeal-report-body">{r.content}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Card>
        <h4>{t('appeal.inspect.recordsTitle')}</h4>
        <Table className="table-fit" columns={recordColumns} dataSource={records} rowKey="id" pagination={false} emptyText={t('common.empty')} />
      </Card>

      <Modal
        open={createOpen}
        title={t('appeal.inspect.createReportTitle')}
        onClose={() => setCreateOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!title.trim() || !content.trim()} onClick={doCreate}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="appeal-complaint-form">
          <p>{t('appeal.inspect.reportKind')}</p>
          <Select
            value={kind}
            onChange={setKind}
            options={['quality', 'anomaly', 'consistency'].map((k) => ({ key: k, label: t(`appeal.inspect.kind.${k}`) }))}
          />
          <p>{t('appeal.inspect.reportTitleLabel')}</p>
          <Input size="large" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
          <p>{t('appeal.inspect.reportContentLabel')}</p>
          <TextArea rows={6} maxLength={4000} value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
