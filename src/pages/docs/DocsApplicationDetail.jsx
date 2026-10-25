import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Countdown, Modal, Notification, Tag, Title, Upload } from 'animal-island-ui';
import { ArrowRightIcon, ClockIcon, PaperclipIcon, SendIcon } from 'naive-icons';
import { api, requestForm } from '../../api/client.js';
import { APPLICATION_STATUS_COLORS, CERT_STATUS_COLORS } from '../../api/docs.js';
import MaterialList from './MaterialList.jsx';

export default function DocsApplicationDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/docs/applications/${id}`)
      .then((d) => setItem(d.item))
      .catch((err) => {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
        setItem(false);
      });
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const withdraw = async () => {
    setBusy(true);
    try {
      await api.post(`/docs/applications/${id}/withdraw`);
      Notification.success(t('docs.detail.withdrawn'));
      setWithdrawOpen(false);
      load();
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const resubmit = async () => {
    setBusy(true);
    try {
      await api.post(`/docs/applications/${id}/resubmit`);
      Notification.success(t('docs.detail.resubmitted'));
      load();
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
    } finally {
      setBusy(false);
    }
  };

  const uploadSupplement = async (conf, file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', conf.key);
    try {
      await requestForm(`/docs/applications/${id}/materials`, fd);
      Notification.success(t('docs.detail.uploaded'));
      load();
    } catch (err) {
      Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
    }
  };

  if (item === null || item === false) {
    return (
      <Card type="dashed">
        <p className="muted-text">{item === false ? t('common.empty') : t('common.loading')}</p>
      </Card>
    );
  }

  const type = item.type || {};
  const cert = item.certificate;
  const isSupplementing = item.status === 'supplementing';
  const deadline = item.supplementDeadline ? new Date(item.supplementDeadline).getTime() : null;

  return (
    <div className="docs-detail">
      <div className="page-header">
        <Title size="middle">
          {t('docs.detail.title', { no: item.appNo })}
        </Title>
        <Tag color={APPLICATION_STATUS_COLORS[item.status]} variant="soft">
          {t(`docs.status.${item.status}`)}
        </Tag>
      </div>

      {cert && (
        <Card color="app-teal" className="docs-cert-banner">
          <div className="docs-cert-banner-inner">
            <div>
              <strong>{t('docs.detail.certReady', { no: cert.certNo })}</strong>
              <p className="muted-text">{t('docs.detail.certReadyTip')}</p>
            </div>
            <Button type="primary" icon={<ArrowRightIcon />} onClick={() => navigate(`/docs/certificates/${cert.id}`)}>
              {t('docs.actions.viewCert')}
            </Button>
          </div>
        </Card>
      )}

      {item.status === 'rejected' && (
        <Card color="app-red" className="docs-band-card">
          <strong>{t('docs.detail.rejectedTitle')}</strong>
          <p>
            {t('docs.reason.' + (item.rejectCode || 'other'))}
            {item.rejectComment ? ` — ${item.rejectComment}` : ''}
          </p>
          <Button onClick={() => navigate(`/docs/apply?type=${item.typeCode}`)}>{t('docs.detail.reapply')}</Button>
        </Card>
      )}

      {isSupplementing && (
        <Card color="app-orange" className="docs-band-card">
          <strong>{t('docs.detail.supplementTitle')}</strong>
          <p>{item.supplementNote}</p>
          {deadline && (
            <p className="docs-deadline">
              <ClockIcon size={16} /> {t('docs.detail.supplementDeadline')}
              <Countdown value={deadline} format="DD 天 HH:mm:ss" size="small" />
            </p>
          )}
          <div className="docs-supplement-upload">
            {(type.materials || []).map((m) => (
              <Upload
                key={m.key}
                accept={m.accept}
                maxCount={m.max_count}
                showUploadList={false}
                customRequest={({ file }) => uploadSupplement(m, file)}
              >
                <Button size="small" type="dashed" icon={<PaperclipIcon />}>
                  {t('docs.detail.uploadFor', { label: m.label })}
                </Button>
              </Upload>
            ))}
          </div>
          <Button type="primary" loading={busy} icon={<SendIcon />} onClick={resubmit}>
            {t('docs.detail.resubmit')}
          </Button>
        </Card>
      )}

      <div className="docs-detail-grid">
        <Card className="docs-block">
          <h3 className="docs-block-title">{t('docs.detail.infoTitle')}</h3>
          <dl className="docs-kv">
            <dt>{t('docs.appList.type')}</dt>
            <dd>{type?.name || item.typeCode}</dd>
            <dt>{t('docs.apply.nickname')}</dt>
            <dd>{item.nickname || '—'}</dd>
            <dt>{t('docs.apply.contact')}</dt>
            <dd>{item.contact || '—'}</dd>
            {type?.bizNoLabel && (
              <>
                <dt>{type.bizNoLabel}</dt>
                <dd>
                  {item.bizNo || '—'}
                  {item.bizCheck?.reserved && (
                    <Tag size="small" variant="soft">
                      {t('docs.detail.bizReserved')}
                    </Tag>
                  )}
                </dd>
              </>
            )}
            <dt>{t('docs.apply.purpose')}</dt>
            <dd>{t(`docs.purpose.${item.purpose}`)}</dd>
            {Object.entries(item.formData || {})
              .filter(([, v]) => v)
              .flatMap(([k, v]) => [
                <dt key={k}>{type?.formFields?.find((f) => f.key === k)?.label || k}</dt>,
                <dd key={`${k}-v`}>{v}</dd>,
              ])}
            <dt>{t('docs.appList.submittedAt')}</dt>
            <dd>{item.submittedAt ? String(item.submittedAt).slice(0, 16).replace('T', ' ') : '—'}</dd>
          </dl>
        </Card>

        <Card className="docs-block">
          <h3 className="docs-block-title">{t('docs.detail.recordsTitle')}</h3>
          <ul className="docs-timeline">
            {(item.records || []).map((r) => (
              <li key={r.id}>
                <span className="docs-timeline-dot" />
                <div>
                  <strong>{t(`docs.record.${r.action}`, { defaultValue: r.action })}</strong>
                  {r.reasonCode && <Tag size="small" color="app-red" variant="soft">{t(`docs.reason.${r.reasonCode}`)}</Tag>}
                  {r.comment && <p className="muted-text">{r.comment}</p>}
                  <p className="muted-text">
                    {String(r.createdAt).slice(0, 16).replace('T', ' ')} · {r.actorName || '—'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="docs-block">
        <h3 className="docs-block-title">{t('docs.detail.materialsTitle')}</h3>
        <MaterialList materials={item.materials} type={type} />
      </Card>

      <div className="docs-apply-actions">
        {(item.status === 'pending' || isSupplementing) && (
          <Button danger onClick={() => setWithdrawOpen(true)}>
            {t('docs.detail.withdraw')}
          </Button>
        )}
        {item.status === 'draft' && (
          <Button type="primary" onClick={() => navigate(`/docs/apply?draft=${item.id}`)}>
            {t('common.edit')}
          </Button>
        )}
        <Button onClick={() => navigate('/docs/applications')}>{t('docs.actions.back')}</Button>
      </div>

      <Modal
        open={withdrawOpen}
        title={t('docs.detail.withdrawConfirmTitle')}
        typewriter={false}
        onClose={() => setWithdrawOpen(false)}
        footer={
          <>
            <Button onClick={() => setWithdrawOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" danger loading={busy} onClick={withdraw}>
              {t('docs.detail.withdraw')}
            </Button>
          </>
        }
      >
        <p>{t('docs.detail.withdrawConfirmBody', { no: item.appNo })}</p>
      </Modal>
    </div>
  );
}
