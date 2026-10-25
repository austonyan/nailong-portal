// 申诉详情:表单信息、材料、操作时间线、补件通知与在线补交、撤回、评价、
// 处理决定与决定书、复核入口。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Notification, Rate, Tag, Title, Upload } from 'animal-island-ui';
import { EyeIcon, PaperclipIcon, SendIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { openAppealMaterial, uploadAppealMaterial } from '../../api/appeal.js';
import {
  APPEAL_STATUS_COLORS,
  DECISION_TYPE_COLORS,
  TextArea,
  fmtDateTime,
  reviewDeadline,
  toastAppealError,
} from './shared.jsx';

const WITHDRAWABLE = ['pending_accept', 'accepted', 'processing'];

export default function AppealAppealDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const [appeal, setAppeal] = useState(null);
  const [supplementNote, setSupplementNote] = useState('');
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalRating, setEvalRating] = useState(0);
  const [evalComment, setEvalComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/appeal/appeals/${params.id}`);
      setAppeal(data.appeal);
    } catch (err) {
      toastAppealError(t, err);
      navigate('/appeal/my');
    }
  }, [params.id, t, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = async () => {
    setBusy(true);
    try {
      await api.post(`/appeal/appeals/${appeal.id}/withdraw`, {});
      Notification.success(t('appeal.detail.withdrawDone'));
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const submitSupplement = async () => {
    setBusy(true);
    try {
      await api.post(`/appeal/appeals/${appeal.id}/supplement`, { note: supplementNote });
      Notification.success(t('appeal.detail.supplementDone'));
      setSupplementNote('');
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const uploadSupplement = ({ file, onProgress, onSuccess, onError }) => {
    uploadAppealMaterial({ ownerType: 'appeal', ownerId: appeal.id, kind: 'proof', file, onProgress })
      .then((m) => {
        onSuccess(m);
        load();
      })
      .catch((err) => {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
        onError(err);
      });
  };

  const openEvaluate = () => {
    setEvalRating(appeal.evaluationRating || 0);
    setEvalComment(appeal.evaluationComment || '');
    setEvalOpen(true);
  };

  const doEvaluate = async () => {
    setBusy(true);
    try {
      await api.post(`/appeal/appeals/${appeal.id}/evaluate`, { rating: evalRating, comment: evalComment });
      Notification.success(t('appeal.detail.evalDone'));
      setEvalOpen(false);
      await load();
    } catch (err) {
      toastAppealError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (!appeal) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const deadline = reviewDeadline(appeal.resolvedAt, appeal.reviewDays);
  const canReview = ['resolved', 'rejected'].includes(appeal.status) && !appeal.review;

  return (
    <div className="appeal-detail-page">
      <div className="page-header">
        <Title size="middle">{appeal.code}</Title>
        <Tag color={APPEAL_STATUS_COLORS[appeal.status] || 'default'} variant="soft">
          {t(`appeal.status.${appeal.status}`)}
        </Tag>
      </div>

      <Card className="appeal-detail-card">
        <dl className="appeal-field-list">
          <div>
            <dt>{t('appeal.apply.bizType')}</dt>
            <dd>
              {t(`appeal.bizType.${appeal.bizType}`)} · {appeal.bizCode}
              {appeal.bizStatus === 'unverified' && (
                <Tag color="app-orange" variant="soft">
                  {t('appeal.detail.bizUnverified')}
                </Tag>
              )}
            </dd>
          </div>
          <div>
            <dt>{t('appeal.apply.reason')}</dt>
            <dd>{appeal.reason}</dd>
          </div>
          <div>
            <dt>{t('appeal.apply.expected')}</dt>
            <dd>{appeal.expected}</dd>
          </div>
          <div>
            <dt>{t('appeal.apply.contact')}</dt>
            <dd>{appeal.contact}</dd>
          </div>
          <div>
            <dt>{t('appeal.my.submittedAtLabel')}</dt>
            <dd>{fmtDateTime(appeal.submittedAt || appeal.createdAt)}</dd>
          </div>
          {appeal.status === 'supplement_required' && (
            <div>
              <dt>{t('appeal.detail.supplementDeadline')}</dt>
              <dd>
                {fmtDateTime(appeal.supplementDeadline)} — {t('appeal.detail.supplementNoteLabel')}: {appeal.supplementNote}
              </dd>
            </div>
          )}
          {appeal.mergedInto && (
            <div>
              <dt>{t('appeal.detail.mergedInto')}</dt>
              <dd>{appeal.mergedInto}</dd>
            </div>
          )}
        </dl>
        <div className="table-actions appeal-detail-actions">
          {WITHDRAWABLE.includes(appeal.status) && (
            <Button danger loading={busy} onClick={withdraw}>
              {t('appeal.detail.withdraw')}
            </Button>
          )}
          {appeal.status === 'resolved' && !appeal.evaluationRating && (
            <Button onClick={openEvaluate}>{t('appeal.detail.evaluate')}</Button>
          )}
          {appeal.review && (
            <Button type="default" onClick={() => navigate(`/appeal/reviews`)}>
              {t('appeal.detail.viewReview')}
            </Button>
          )}
          {canReview && (
            <Button type="primary" onClick={() => navigate('/appeal/reviews')}>
              {t('appeal.detail.applyReview')}
            </Button>
          )}
          {canReview && deadline && (
            <span className="muted-text">{t('appeal.detail.reviewWindow', { date: deadline.format('YYYY-MM-DD') })}</span>
          )}
        </div>
      </Card>

      {appeal.decisionType && (
        <Card color="app-teal" className="appeal-decision-banner">
          <h4>
            {t('appeal.detail.decisionTitle')}
            <Tag color={DECISION_TYPE_COLORS[appeal.decisionType] || 'default'} variant="soft">
              {t(`appeal.decisionType.${appeal.decisionType}`)}
            </Tag>
          </h4>
          <p>{appeal.decisionReason}</p>
          {appeal.decisionBasis && (
            <p className="muted-text">{t('appeal.detail.decisionBasis')}: {appeal.decisionBasis}</p>
          )}
          {appeal.decision && (
            <Button size="small" icon={<EyeIcon />} onClick={() => navigate(`/appeal/decisions/${appeal.decision.code}`)}>
              {t('appeal.detail.viewDecisionDoc')}
            </Button>
          )}
        </Card>
      )}

      {appeal.status === 'supplement_required' && (
        <Card color="app-orange" className="appeal-supplement-card">
          <h4>{t('appeal.detail.supplementTitle')}</h4>
          <p className="muted-text">{t('appeal.detail.supplementTip')}</p>
          <TextArea rows={3} maxLength={500} value={supplementNote} onChange={(e) => setSupplementNote(e.target.value)} placeholder={t('appeal.detail.supplementPlaceholder')} />
          <div className="appeal-materials-section">
            <Upload accept="image/*,application/pdf" showUploadList={false} customRequest={uploadSupplement}>
              {t('appeal.detail.uploadSupplement')}
            </Upload>
          </div>
          <Button type="primary" icon={<SendIcon />} loading={busy} disabled={!supplementNote.trim()} onClick={submitSupplement}>
            {t('appeal.detail.submitSupplement')}
          </Button>
        </Card>
      )}

      <Card className="appeal-detail-card">
        <h4>
          <PaperclipIcon size={18} /> {t('appeal.detail.materials')}
        </h4>
        {appeal.materials.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        <ul className="appeal-material-list">
          {appeal.materials.map((m) => (
            <li key={m.id}>
              <Tag color={m.origin === 'supplement' ? 'app-orange' : 'app-blue'} variant="soft">
                {t(`appeal.materialKind.${m.kind}`)}
              </Tag>
              <span>{m.filename}</span>
              <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openAppealMaterial(m.id)}>
                {t('appeal.my.preview')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="appeal-detail-card">
        <h4>{t('appeal.detail.records')}</h4>
        <ul className="appeal-record-timeline">
          {appeal.records.map((r) => (
            <li key={r.id}>
              <Tag variant="soft" color="app-teal" size="small">
                {t(`appeal.recordAction.${r.action}`, { defaultValue: r.action })}
              </Tag>
              <span>{r.actorName || t('appeal.detail.systemActor')}</span>
              <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
              {r.comment && <p className="muted-text">{r.comment}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        open={evalOpen}
        title={t('appeal.detail.evaluateTitle')}
        onClose={() => setEvalOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setEvalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={busy} disabled={!evalRating} onClick={doEvaluate}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="appeal-eval-body">
          <Rate value={evalRating} onChange={setEvalRating} />
          <TextArea rows={3} maxLength={300} value={evalComment} onChange={(e) => setEvalComment(e.target.value)} placeholder={t('appeal.detail.evalPlaceholder')} />
        </div>
      </Modal>
    </div>
  );
}
