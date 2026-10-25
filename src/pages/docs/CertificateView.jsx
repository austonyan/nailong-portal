import { useTranslation } from 'react-i18next';
import { StarIcon } from 'naive-icons';
import { CERT_STATUS_COLORS } from '../../api/docs.js';
import { Tag } from 'animal-island-ui';

// 电子文书(虚构样式): 印章与水印均为装饰,固定携带"虚构娱乐·无现实效力"声明。
export default function CertificateView({ cert, typeName, bizNoLabel, issuer, watermark, sealEnabled }) {
  const { t } = useTranslation();
  if (!cert) return null;
  const wm = watermark || t('docs.cert.watermarkFallback');

  return (
    <div className="doc-cert" role="figure" aria-label={t('docs.cert.ariaLabel', { no: cert.certNo })}>
      <div className="doc-cert-watermark" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i}>{wm}</span>
        ))}
      </div>
      <header className="doc-cert-head">
        <h2 className="doc-cert-issuer">{issuer}</h2>
        <p className="doc-cert-en">CERTIFICATE OF AUTHENTICATION</p>
      </header>
      <dl className="doc-cert-body">
        <div>
          <dt>{t('docs.cert.certNo')}</dt>
          <dd className="doc-cert-no">{cert.certNo}</dd>
        </div>
        <div>
          <dt>{t('docs.appList.type')}</dt>
          <dd>{typeName || cert.typeCode}</dd>
        </div>
        <div>
          <dt>{t('docs.cert.holder')}</dt>
          <dd>{cert.holderName || '—'}</dd>
        </div>
        <div>
          <dt>{bizNoLabel || t('docs.cert.bizNo')}</dt>
          <dd>{cert.bizNo || '—'}</dd>
        </div>
        <div>
          <dt>{t('docs.cert.issuedAt')}</dt>
          <dd>{String(cert.issuedAt || '').slice(0, 10)}</dd>
        </div>
        <div>
          <dt>{t('docs.cert.expiresAt')}</dt>
          <dd>{String(cert.expiresAt || '').slice(0, 10)}</dd>
        </div>
      </dl>
      {sealEnabled && (
        <div className="doc-cert-seal" aria-hidden="true">
          <StarIcon size={22} />
          <span className="doc-cert-seal-line">皇家文书与</span>
          <span className="doc-cert-seal-line">认证署</span>
          <strong>认证专用章</strong>
          <span className="doc-cert-seal-sub">FICTIONAL · ENTERTAINMENT</span>
        </div>
      )}
      <footer className="doc-cert-foot">
        <span>{wm}</span>
        <Tag color={CERT_STATUS_COLORS[cert.status] || 'default'} variant="soft">
          {t(`docs.certStatus.${cert.status}`)}
        </Tag>
      </footer>
    </div>
  );
}
