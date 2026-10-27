// 我的复核:对已处理申诉提起复核(一次终局)、状态追踪与复核结果。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Drawer, Modal, Select, Tag, Title } from 'animal-island-ui';
import { PlusIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { REVIEW_STATUS_COLORS, DECISION_TYPE_COLORS, TextArea, fmtDateTime, toastAppealError } from './shared.jsx';
import { toastSuccess } from '../../components/toast.js';

export default function AppealReviews() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [appealId, setAppealId] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/appeal/reviews');
      setItems(data.items);
    } catch (err) {
      toastAppealError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = async () => {
    setCreateOpen(true);
    try {
      const data = await api.get('/appeal/appeals');
      setCandidates(data.items.filter((a) => ['resolved', 'rejected'].includes(a.status) && !a.review));
    } catch (err) {
      toastAppealError(t, err);
      setCandidates([]);
    }
  };

  const doCreate = async () => {
    if (!appealId) return;
    setBusy(true);
    try {
      await api.post('/appeal/reviews', { appealId, reason });
      toastSuccess(t('appeal.review.submitDone'));
      setCreateOpen(false);
      setAppealId(null);
      setReason('');
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (r) => {
    try {
      const data = await api.get(`/appeal/reviews/${r.id}`);
      setDetail(data.review);
    } catch (err) {
      toastAppealError(t, err);
    }
  };

  const filtered = (items ?? []).filter((r) => !status || r.status === status);

  return (
    <div className="appeal-list-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.review.title')}</Title>
        <div className="table-actions appeal-filter-bar">
          <Select
            value={status}
            onChange={setStatus}
            options={[
              { key: '', label: t('appeal.my.allStatus') },
              { key: 'pending', label: t('appeal.reviewStatus.pending') },
              { key: 'reviewing', label: t('appeal.reviewStatus.reviewing') },
              { key: 'completed', label: t('appeal.reviewStatus.completed') },
            ]}
          />
          <Button type="primary" icon={<PlusIcon />} onClick={openCreate}>
            {t('appeal.review.create')}
          </Button>
        </div>
      </div>

      <Card color="app-yellow" variant="soft" className="appeal-review-tip">
        <p className="muted-text">{t('appeal.review.finalTip')}</p>
      </Card>

      {items === null && (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      )}
      {items !== null && filtered.length === 0 && (
        <Card type="dashed">
          <p className="muted-text">{t('common.empty')}</p>
        </Card>
      )}

      {filtered.map((r) => (
        <Card key={r.id} hoverable className="appeal-item-card" onClick={() => openDetail(r)}>
          <div className="appeal-item-head">
            <strong>{r.code}</strong>
            <Tag color={REVIEW_STATUS_COLORS[r.status] || 'default'} variant="soft">
              {t(`appeal.reviewStatus.${r.status}`)}
            </Tag>
            {r.decisionType && (
              <Tag color={DECISION_TYPE_COLORS[r.decisionType] || 'default'} variant="outlined">
                {t(`appeal.decisionType.${r.decisionType}`)}
              </Tag>
            )}
          </div>
          <p className="muted-text">
            {t('appeal.review.forAppeal', { no: r.appealCode })} · {t('appeal.my.submittedAt', { time: fmtDateTime(r.submittedAt || r.createdAt) })}
          </p>
          <p className="appeal-item-reason">{r.reason}</p>
        </Card>
      ))}

      <Modal
        maskClosable={false}
        open={createOpen}
        title={t('appeal.review.createTitle')}
        onClose={() => setCreateOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!appealId || reason.trim().length < 10} onClick={doCreate}>
              {t('appeal.review.create')}
            </Button>
          </>
        }
      >
        <div className="appeal-review-form">
          <p className="muted-text">{t('appeal.review.pickAppeal')}</p>
          <Select
            value={appealId ? String(appealId) : ''}
            onChange={(v) => setAppealId(v ? Number(v) : null)}
            placeholder={t('appeal.review.pickAppeal')}
            options={candidates.map((a) => ({ key: String(a.id), label: `${a.code} · ${t(`appeal.bizType.${a.bizType}`)}` }))}
          />
          {candidates.length === 0 && <p className="muted-text">{t('appeal.review.noCandidates')}</p>}
          <p>{t('appeal.review.reasonLabel')}</p>
          <TextArea maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('appeal.review.reasonPlaceholder')} />
        </div>
      </Modal>

      <Drawer maskClosable={false} open={!!detail} title={detail?.code} onClose={() => setDetail(null)} width={520}>
        {detail && (
          <div className="appeal-detail-body">
            <dl className="appeal-field-list">
              <div>
                <dt>{t('common.status')}</dt>
                <dd>
                  <Tag color={REVIEW_STATUS_COLORS[detail.status] || 'default'} variant="soft">
                    {t(`appeal.reviewStatus.${detail.status}`)}
                  </Tag>
                </dd>
              </div>
              <div>
                <dt>{t('appeal.review.appealLabel')}</dt>
                <dd>{detail.appealSummary?.code || detail.appealCode}</dd>
              </div>
              <div>
                <dt>{t('appeal.review.reasonLabel')}</dt>
                <dd>{detail.reason}</dd>
              </div>
              {detail.decisionType && (
                <>
                  <div>
                    <dt>{t('appeal.review.decision')}</dt>
                    <dd>
                      <Tag color={DECISION_TYPE_COLORS[detail.decisionType] || 'default'} variant="soft">
                        {t(`appeal.decisionType.${detail.decisionType}`)}
                      </Tag>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('appeal.detail.decisionReason')}</dt>
                    <dd>{detail.decisionReason}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>{t('appeal.my.submittedAtLabel')}</dt>
                <dd>{fmtDateTime(detail.submittedAt)}</dd>
              </div>
              {detail.decidedAt && (
                <div>
                  <dt>{t('appeal.review.decidedAt')}</dt>
                  <dd>
                    {fmtDateTime(detail.decidedAt)} · {detail.decidedBy}
                  </dd>
                </div>
              )}
            </dl>
            {detail.decision && (
              <Button type="primary" size="small" onClick={() => navigate(`/appeal/decisions/${detail.decision.code}`)}>
                {t('appeal.detail.viewDecisionDoc')}
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
