import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { CopyIcon, DownloadIcon, PrinterIcon, SearchIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { CERT_STATUS_COLORS, exportCertificatePng } from '../../api/docs.js';
import CertificateView from './CertificateView.jsx';
import { toastSuccess, toastError, toastWarning } from '../../components/toast.js';

// 证书状态配色按 UI 规范收敛:已过期用中性棕(共享表仍是 default)。
const STATUS_COLORS = { ...CERT_STATUS_COLORS, expired: 'brown' };

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
        toastError(t(`api.${err.code}`, { defaultValue: t('api.INTERNAL_ERROR') }));
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
      toastSuccess(t('docs.cert.copied'));
    } catch {
      toastWarning(t('docs.cert.copyFailed'));
    }
  };

  return (
    <div className="docs-cert-detail">
      <div className="page-header docs-cert-header">
        <div className="docs-cert-title">
          <h1 className="page-title">
            <Title size="middle">{t('docs.certDetail.title')}</Title>
          </h1>
          <Tag color={STATUS_COLORS[item.status] || 'brown'} variant="soft">
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
                title: t('docs.cert.titleEn'),
                typeName: item.typeName,
                bizNoLabel: item.application?.type?.bizNoLabel,
                issuer: item.issuer,
                sealEnabled: item.sealEnabled,
                labels: {
                  certNo: t('docs.cert.certNo'),
                  type: t('docs.appList.type'),
                  holder: t('docs.cert.holder'),
                  bizNo: t('docs.cert.bizNo'),
                  issuedAt: t('docs.cert.issuedAt'),
                  expiresAt: t('docs.cert.expiresAt'),
                  seal1: t('docs.cert.seal1'),
                  seal2: t('docs.cert.seal2'),
                  seal3: t('docs.cert.seal3'),
                },
              }).catch(() => toastError(t('docs.cert.exportFailed')))
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
          sealEnabled={item.sealEnabled}
        />
      </div>

      {item.status === 'revoked' && item.revokedReason && (
        <Card pattern="app-red" className="docs-band-card">
          <strong>{t('docs.certDetail.revokedTitle')}</strong>
          <p>{item.revokedReason}</p>
        </Card>
      )}

      <Card className="docs-block">
        <h2 className="docs-block-title">{t('docs.certDetail.tipsTitle')}</h2>
        <ul className="docs-tips">
          <li>{t('docs.certDetail.tip1')}</li>
          <li>{t('docs.certDetail.tip2')}</li>
        </ul>
      </Card>
    </div>
  );
}
