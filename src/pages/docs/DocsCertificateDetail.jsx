import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Notification, Tag, Title } from 'animal-island-ui';
import { CopyIcon, DownloadIcon, PrinterIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { CERT_STATUS_COLORS, exportCertificatePng } from '../../api/docs.js';
import CertificateView from './CertificateView.jsx';

export default function DocsCertificateDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/docs/certificates/${id}`)
      .then((d) => {
        if (!cancelled) setItem(d.item);
      })
      .catch((err) => {
        Notification.error(t(`api.${err.code}`, { defaultValue: err.message }));
        if (!cancelled) setItem(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  useEffect(() => {
    if (!printing) return;
    // print 样式只展示证书本体
    document.body.classList.add('docs-printing');
    const done = () => {
      document.body.classList.remove('docs-printing');
      setPrinting(false);
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    return done;
  }, [printing]);

  if (item === null || item === false) {
    return (
      <Card type="dashed">
        <p className="muted-text">{item === false ? t('common.empty') : t('common.loading')}</p>
      </Card>
    );
  }

  const copyNo = async () => {
    try {
      await navigator.clipboard.writeText(item.certNo);
      Notification.success(t('docs.cert.copied'));
    } catch {
      Notification.warning(t('docs.cert.copyFailed'));
    }
  };

  return (
    <div className="docs-cert-detail">
      <div className="page-header docs-cert-header">
        <div className="docs-cert-title">
          <Title size="middle">{t('docs.certDetail.title')}</Title>
          <Tag color={CERT_STATUS_COLORS[item.status]} variant="soft">
            {t(`docs.certStatus.${item.status}`)}
          </Tag>
        </div>
        <div className="table-actions">
          <Button icon={<CopyIcon />} onClick={copyNo}>
            {t('docs.cert.copyNo')}
          </Button>
          <Button
            icon={<DownloadIcon />}
            onClick={() =>
              exportCertificatePng({
                cert: item,
                typeName: item.typeName,
                bizNoLabel: item.application?.type?.bizNoLabel,
                issuer: item.issuer,
                watermark: item.watermark,
                sealEnabled: item.sealEnabled,
              }).catch(() => Notification.error(t('docs.cert.exportFailed')))
            }
          >
            {t('docs.cert.downloadPng')}
          </Button>
          <Button icon={<PrinterIcon />} onClick={() => setPrinting(true)}>
            {t('docs.cert.downloadPdf')}
          </Button>
          <Button type="primary" icon={<SearchIcon />} onClick={() => navigate(`/docs/verify?no=${encodeURIComponent(item.certNo)}`)}>
            {t('docs.cert.verifyEntry')}
          </Button>
        </div>
      </div>

      <div className="docs-cert-stage">
        <CertificateView
          cert={item}
          typeName={item.typeName}
          bizNoLabel={item.application?.type?.bizNoLabel}
          issuer={item.issuer}
          watermark={item.watermark}
          sealEnabled={item.sealEnabled}
        />
      </div>

      {item.status === 'revoked' && item.revokedReason && (
        <Card color="app-red" className="docs-band-card">
          <strong>{t('docs.certDetail.revokedTitle')}</strong>
          <p>{item.revokedReason}</p>
        </Card>
      )}

      <Card className="docs-block">
        <h3 className="docs-block-title">{t('docs.certDetail.tipsTitle')}</h3>
        <ul className="docs-tips">
          <li>{t('docs.certDetail.tip1')}</li>
          <li>{t('docs.certDetail.tip2')}</li>
          <li>{t('docs.certDetail.tip3')}</li>
        </ul>
      </Card>
    </div>
  );
}
