// 申请详情:表单信息、材料、审核记录、补件与撤销。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button, Card, Modal, Tag, Title, Upload } from 'animal-island-ui';
import { EyeIcon, RefreshIcon, PrinterIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { openVisaMaterial, uploadVisaMaterial } from '../../api/visa.js';
import {
  APPLICATION_STATUS_COLORS,
  PERMIT_STATUS_COLORS,
  TextArea,
  fmtDateTime,
  toastVisaError,
} from './shared.jsx';
import { toastSuccess, toastError } from '../../components/toast.js';

const WITHDRAWABLE = ['pending_review', 'supplement_required'];

export default function VisaApplicationDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [app, setApp] = useState(null);
  const [suppNote, setSuppNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/visa/applications/${id}`);
      setApp(data.application);
    } catch (err) {
      toastVisaError(t, err);
      setApp(null);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = async () => {
    setBusy(true);
    try {
      await api.post(`/visa/applications/${id}/withdraw`);
      toastSuccess(t('visa.my.withdrawn'));
      setWithdrawOpen(false);
      await load();
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  const submitSupplement = async () => {
    setBusy(true);
    try {
      await api.post(`/visa/applications/${id}/supplement`, { note: suppNote });
      toastSuccess(t('visa.detail.supplementSent'));
      setSuppNote('');
      await load();
    } catch (err) {
      toastVisaError(t, err);
    } finally {
      setBusy(false);
    }
  };

  if (!app) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  const supplementMaterials = app.materials.filter((m) => m.origin === 'supplement');
  const canSupplement = app.status === 'supplement_required';

  const uploadSupplement = ({ file, onProgress, onSuccess, onError }) => {
    uploadVisaMaterial({ applicationId: app.id, kind: 'other', file, onProgress })
      .then((material) => {
        setApp((prev) => ({ ...prev, materials: [...prev.materials, material] }));
        onSuccess(material);
      })
      .catch((err) => {
        toastError(t(`api.${err.code}`, { defaultValue: err.message }));
        onError(err);
      });
  };

  const rows = [
    [t('visa.field.appNo'), app.appNo],
    [t('visa.field.type'), `${app.typeName} (${app.typeCode})`],
    [t('visa.form.nickname'), app.nickname],
    [t('visa.form.contact'), app.contact],
    [t('visa.form.virtualId'), app.virtualId || '-'],
    [t('visa.form.purpose'), app.purpose],
    [
      t('visa.field.trip'),
      `${fmtDateTime(app.planArrive).slice(0, 10)} ~ ${fmtDateTime(app.planLeave).slice(0, 10)}`,
    ],
    [t('visa.form.itinerary'), app.itinerary],
    [t('visa.form.inviterName'), app.inviterName || '-'],
    [t('visa.form.inviterContact'), app.inviterContact || '-'],
    [t('visa.form.companions'), app.companions || '-'],
    [t('visa.field.submittedAt'), fmtDateTime(app.submittedAt)],
  ];

  return (
    <div className="visa-detail-page">
      <div className="page-header">
        <Title size="middle">{t('visa.detail.title')}</Title>
        <Tag color={APPLICATION_STATUS_COLORS[app.status] || 'default'} variant="solid" size="large">
          {t(`visa.status.${app.status}`)}
        </Tag>
      </div>

      {app.status === 'rejected' && (
        <Card color="app-red" className="visa-reject-banner">
          <strong>{t('visa.detail.rejectTitle')}</strong>
          <p>
            {t(`visa.rejectReason.${app.rejectCode || 'other'}`)}
            {app.rejectComment ? ` — ${app.rejectComment}` : ''}
          </p>
        </Card>
      )}
      {app.status === 'closed' && (
        <Card color="app-orange" className="visa-reject-banner">
          <strong>{t('visa.detail.closedTitle')}</strong>
          <p>{t('visa.detail.closedBody')}</p>
        </Card>
      )}

      <Card className="visa-detail-card">
        <dl className="visa-field-list">
          {rows.map(([label, value]) => (
            <div key={label} className="visa-field-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {app.permit && (
        <Card color="app-teal" className="visa-permit-banner">
          <div className="visa-permit-banner-inner">
            <div>
              <strong>{t('visa.detail.permitReady')}</strong>
              <p>{t('visa.permit.no', { no: app.permit.visaNo })}</p>
            </div>
            <Tag color={PERMIT_STATUS_COLORS[app.permit.status] || 'default'} variant="solid">
              {t(`visa.permitStatus.${app.permit.status}`)}
            </Tag>
            <Button type="primary" onClick={() => navigate('/visa/permits')}>
              {t('visa.nav.permits')}
            </Button>
          </div>
        </Card>
      )}

      {canSupplement && (
        <Card color="app-orange" className="visa-supplement-card">
          <h4>{t('visa.detail.supplementTitle')}</h4>
          {app.supplementDeadline && (
            <p>
              {t('visa.detail.supplementDeadline', { time: fmtDateTime(app.supplementDeadline) })}
            </p>
          )}
          <p className="muted-text">
            {t('visa.detail.supplementAsk')} {app.reviews.filter((r) => r.action === 'require_supplement').at(-1)?.comment}
          </p>
          <Upload drag accept="image/*,application/pdf" showUploadList={false} customRequest={uploadSupplement}>
            <div style={{ padding: 24 }}>{t('visa.detail.uploadSupplement')}</div>
          </Upload>
          {supplementMaterials.length > 0 && (
            <ul className="visa-material-list">
              {supplementMaterials.map((m) => (
                <li key={m.id}>
                  <span>{m.filename}</span>
                  <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openVisaMaterial(m.id)}>
                    {t('visa.my.preview')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <TextArea value={suppNote} onChange={(e) => setSuppNote(e.target.value)} placeholder={t('visa.detail.supplementNotePlaceholder')} />
          <div className="visa-guide-actions">
            <Button type="primary" loading={busy} onClick={submitSupplement} disabled={busy}>
              {t('visa.detail.submitSupplement')}
            </Button>
          </div>
        </Card>
      )}

      <Card className="visa-detail-card">
        <h4>{t('visa.detail.materials')}</h4>
        {app.materials.length === 0 && <p className="muted-text">{t('common.empty')}</p>}
        <ul className="visa-material-list">
          {app.materials.map((m) => (
            <li key={m.id}>
              <Tag size="small" variant="soft" color={m.kind === 'avatar' ? 'app-teal' : 'app-blue'}>
                {t(`visa.materialKind.${m.kind}`)}
              </Tag>
              <span>{m.filename}</span>
              <Button type="text" size="small" icon={<EyeIcon />} onClick={() => openVisaMaterial(m.id)}>
                {t('visa.my.preview')}
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="visa-detail-card">
        <h4>{t('visa.detail.reviews')}</h4>
        {app.reviews.length === 0 && <p className="muted-text">{t('visa.detail.noReviews')}</p>}
        <ul className="visa-review-timeline">
          {app.reviews.map((r) => (
            <li key={r.id}>
              <div className="visa-review-head">
                <Tag variant="soft" color={r.action === 'reject' ? 'app-red' : r.action === 'approve' ? 'app-green' : 'app-yellow'}>
                  {t(`visa.reviewAction.${r.action}`)}
                </Tag>
                <span>{r.reviewerName}</span>
                <span className="muted-text">{fmtDateTime(r.createdAt)}</span>
              </div>
              {r.reasonCode && <p>{t(`visa.rejectReason.${r.reasonCode}`)}</p>}
              {r.comment && <p className="muted-text">{r.comment}</p>}
            </li>
          ))}
        </ul>
      </Card>

      <div className="visa-guide-actions">
        <Button onClick={() => navigate('/visa/applications')}>{t('visa.back')}</Button>
        {WITHDRAWABLE.includes(app.status) && (
          <Button danger onClick={() => setWithdrawOpen(true)}>
            {t('visa.my.withdraw')}
          </Button>
        )}
        {['rejected', 'closed', 'withdrawn', 'issued'].includes(app.status) && (
          <Button icon={<RefreshIcon />} onClick={() => navigate(`/visa/apply/${app.typeCode}`)}>
            {t('visa.detail.reapply')}
          </Button>
        )}
        <Button icon={<PrinterIcon />} onClick={() => window.print()}>
          {t('visa.detail.print')}
        </Button>
      </div>

      <Modal
        maskClosable={false}
        open={withdrawOpen}
        title={t('visa.my.withdrawConfirmTitle')}
        onClose={() => setWithdrawOpen(false)}
        typewriter={false}
        footer={
          <>
            <Button onClick={() => setWithdrawOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} onClick={withdraw} disabled={busy}>
              {t('visa.my.withdraw')}
            </Button>
          </>
        }
      >
        {t('visa.my.withdrawConfirmBody', { no: app.appNo })}
      </Modal>
    </div>
  );
}
