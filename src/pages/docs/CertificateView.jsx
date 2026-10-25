import { useTranslation } from 'react-i18next';
import { StarIcon } from 'naive-icons';
import { CERT_STATUS_COLORS } from '../../api/docs.js';
import { Tag } from 'animal-island-ui';

// 电子文书: 印章为装饰。
export default function CertificateView({ cert, typeName, bizNoLabel, issuer, sealEnabled }) {
  const { t } = useTranslation();
  if (!cert) return null;

  return (
    <div className="doc-cert" role="figure" aria-label={t('docs.cert.ariaLabel', { no: cert.certNo })}>
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
        </div>
      )}
      <footer className="doc-cert-foot">
        <Tag color={CERT_STATUS_COLORS[cert.status] || 'default'} variant="soft">
          {t(`docs.certStatus.${cert.status}`)}
        </Tag>
      </footer>
    </div>
  );
}
