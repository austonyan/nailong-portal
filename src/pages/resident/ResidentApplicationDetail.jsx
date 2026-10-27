// 登记申请详情:表单数据、材料、审核记录、补件通知与在线补交、驳回原因、撤销与重新申请。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Modal, Tag, Title, Upload } from 'animal-island-ui';
import { AlertTriangleIcon, PaperclipIcon, TrashIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { uploadResidentMaterial } from '../../api/resident.js';
import {
  APPLICATION_STATUS_COLORS,
  StatusTag,
  TextArea,
  fmtDateTime,
  toastResError,
  toastResSuccess,
} from './shared.jsx';

const REVIEW_ACTION_I18N = {
  approve: 'res.reviewAction.approve',
  reject: 'res.reviewAction.reject',
  require_supplement: 'res.reviewAction.requireSupplement',
};

export default function ResidentApplicationDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [app, setApp] = useState(null);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [supplementNote, setSupplementNote] = useState('');
  const [supplementMaterials, setSupplementMaterials] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/resident/applications/${id}`);
      setApp(data.application);
    } catch (err) {
      toastResError(t, err);
      setApp(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (app === null || app === false) {
    return (
      <Card type="dashed">
        <p className="muted-text">{app === false ? t('res.detail.notFound') : t('common.loading')}</p>
      </Card>
    );
  }

  const canWithdraw = ['pending_review', 'supplement_required'].includes(app.status);
  const canSupplement = app.status === 'supplement_required';
  const canReapply = ['rejected', 'closed', 'withdrawn'].includes(app.status);

  const withdraw = async () => {
    setBusy(true);
    try {
      await api.post(`/resident/applications/${app.id}/withdraw`);
      toastResSuccess(t('res.detail.withdrawn'));
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const uploadSupplement = ({ file, onProgress, onSuccess, onError }) => {
    uploadResidentMaterial({ applicationId: app.id, kind: 'other', file, onProgress })
      .then((material) => {
        setSupplementMaterials((prev) => [...prev, material]);
        onSuccess(material);
      })
      .catch((err) => {
        toastResError(t, err);
        onError(err);
      });
  };

  const submitSupplement = async () => {
    setBusy(true);
    try {
      await api.post(`/resident/applications/${app.id}/supplement`, { note: supplementNote });
      setSupplementOpen(false);
      setSupplementNote('');
      setSupplementMaterials([]);
      toastResSuccess(t('res.detail.supplementSent'));
      load();
    } catch (err) {
      toastResError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const removeSupplement = async (material) => {
    try {
      await api.del(`/resident/materials/${material.id}`);
      setSupplementMaterials((prev) => prev.filter((m) => m.id !== material.id));
    } catch (err) {
      toastResError(t, err);
    }
  };

  return (
    <div className="res-app-detail">
      <div className="page-header">
        <Title size="middle" color="app-green">
          {app.appNo}
        </Title>
        <StatusTag value={app.status} map={APPLICATION_STATUS_COLORS} i18nPrefix="res.appStatus" />
      </div>
      <p className="muted-text">
        {app.typeName} · {t('res.detail.submittedAt', { time: fmtDateTime(app.submittedAt) })}
      </p>

      {app.status === 'supplement_required' && (
        <Card color="app-orange" className="res-supplement-notice">
          <div className="res-supplement-head">
            <AlertTriangleIcon size={20} />
            <b>{t('res.detail.supplementRequired')}</b>
          </div>
          <p>{app.supplementNote || t('res.detail.supplementNoNote')}</p>
          <p className="muted-text">{t('res.detail.supplementDeadline', { time: fmtDateTime(app.supplementDeadline) })}</p>
          <Button type="primary" size="small" onClick={() => setSupplementOpen(true)}>
            {t('res.detail.supplementNow')}
          </Button>
        </Card>
      )}

      {app.status === 'rejected' && (
        <Card color="app-red" className="res-reject-notice">
          <b>{t('res.detail.rejectedTitle')}</b>
          <p>
            {t('res.detail.rejectReason')}: {t(`res.rejectReason.${app.rejectCode || 'other'}`)}
          </p>
          {app.rejectComment && <p className="muted-text">{app.rejectComment}</p>}
        </Card>
      )}

      <Card className="res-info-card">
        <h4>{t('res.detail.infoTitle')}</h4>
        <dl className="res-info-list">
          <div>
            <dt>{t('res.form.nickname')}</dt>
            <dd>{app.nickname}</dd>
          </div>
          <div>
            <dt>{t('res.form.contact')}</dt>
            <dd>{app.contact}</dd>
          </div>
          <div>
            <dt>{t('res.form.virtualAddress')}</dt>
            <dd>{app.virtualAddress || '-'}</dd>
          </div>
          <div>
            <dt>{t('res.form.purposes')}</dt>
            <dd>{(app.purposes || []).map((p) => t(`res.purpose.${p}`)).join('、')}</dd>
          </div>
          <div>
            <dt>{t('res.form.bio')}</dt>
            <dd>{app.bio || '-'}</dd>
          </div>
          {app.card && (
            <div>
              <dt>{t('res.card.title')}</dt>
              <dd>
                <Tag color="app-green" variant="soft">
                  {app.card.cardNo}
                </Tag>
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="res-info-card">
        <h4>
          <PaperclipIcon size={18} /> {t('res.detail.materialsTitle')}
        </h4>
        {app.materials.length === 0 ? (
          <p className="muted-text">{t('common.empty')}</p>
        ) : (
          <div className="res-materials-section">
            {app.materials.map((m) => (
              <div key={m.id} className="res-material-row">
                <Tag variant="soft" color={m.origin === 'supplement' ? 'app-orange' : 'app-blue'}>
                  {t(`res.materialKind.${m.kind}`)}
                  {m.origin === 'supplement' ? ` · ${t('res.materialOrigin.supplement')}` : ''}
                </Tag>
                <span className="res-material-name">{m.filename}</span>
                <span className="muted-text">{fmtDateTime(m.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="res-info-card">
        <h4>{t('res.detail.recordsTitle')}</h4>
        {app.reviews.length === 0 ? (
          <p className="muted-text">{t('res.detail.noRecords')}</p>
        ) : (
          <div className="res-review-list">
            {app.reviews.map((r) => (
              <div key={r.id} className="res-review-item">
                <div className="res-review-head">
                  <Tag color={r.action === 'approve' ? 'app-green' : r.action === 'reject' ? 'app-red' : 'app-orange'} variant="soft">
                    {t(REVIEW_ACTION_I18N[r.action] || 'res.reviewAction.other')}
                  </Tag>
                  <span className="muted-text">
                    {r.reviewerName} · {fmtDateTime(r.createdAt)}
                  </span>
                </div>
                {r.comment && <p>{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="res-guide-actions">
        <Button onClick={() => navigate('/resident/applications')}>{t('res.back')}</Button>
        {canWithdraw && (
          <Button danger loading={busy} onClick={withdraw} disabled={busy}>
            {t('res.detail.withdraw')}
          </Button>
        )}
        {canReapply && (
          <Button type="primary" onClick={() => navigate('/resident/apply')}>
            {t('res.detail.reapply')}
          </Button>
        )}
      </div>

      <Modal
        maskClosable={false}
        open={supplementOpen}
        title={t('res.detail.supplementModalTitle')}
        onClose={() => setSupplementOpen(false)}
        typewriter={false}
        width={560}
        footer={
          <>
            <Button onClick={() => setSupplementOpen(false)}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              loading={busy}
              disabled={supplementMaterials.length === 0 && !supplementNote.trim()}
              onClick={submitSupplement}
            >
              {t('res.detail.supplementSubmit')}
            </Button>
          </>
        }
      >
        <div className="res-supplement-body">
          <p className="muted-text">{t('res.detail.supplementTip')}</p>
          <Upload accept="image/*,application/pdf" maxCount={6} showUploadList={false} customRequest={uploadSupplement}>
            {t('res.form.uploadOther')}
          </Upload>
          {supplementMaterials.map((m) => (
            <div key={m.id} className="res-material-row">
              <Tag variant="soft" color="app-orange">
                {t('res.materialOrigin.supplement')}
              </Tag>
              <span className="res-material-name">{m.filename}</span>
              <Button type="text" size="small" danger icon={<TrashIcon />} onClick={() => removeSupplement(m)}>
                {t('common.delete')}
              </Button>
            </div>
          ))}
          <TextArea rows={3} maxLength={500} placeholder={t('res.detail.supplementNotePlaceholder')} value={supplementNote} onChange={(e) => setSupplementNote(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
