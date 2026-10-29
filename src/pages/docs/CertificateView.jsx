import { useTranslation } from 'react-i18next';
import { StarIcon } from 'naive-icons';
import { CERT_STATUS_COLORS } from '../../api/docs.js';
import { Tag } from 'animal-island-ui';
import { fmtDate } from '../../lib/date.js';

// 证书状态配色按 UI 规范收敛:已过期用中性棕(共享表仍是 default)。
const STATUS_COLORS = { ...CERT_STATUS_COLORS, expired: 'brown' };

// 电子文书: 印章为装饰。
export default function CertificateView({ cert, typeName, bizNoLabel, issuer, sealEnabled }) {
  const { t } = useTranslation();
  if (!cert) return null;

  return (
    <div className="doc-cert" role="figure" aria-label={t('docs.cert.ariaLabel', { no: cert.certNo })}>
      <header className="doc-cert-head">
        <h2 className="doc-cert-issuer">{issuer}</h2>
        <p className="doc-cert-en">{t('docs.cert.titleEn')}</p>
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
          <dd>{cert.issuedAt ? fmtDate(cert.issuedAt) : ''}</dd>
        </div>
        <div>
          <dt>{t('docs.cert.expiresAt')}</dt>
          <dd>{cert.expiresAt ? fmtDate(cert.expiresAt) : ''}</dd>
        </div>
      </dl>
      {sealEnabled && (
        <div className="doc-cert-seal" aria-hidden="true">
          <StarIcon size={22} />
          <span className="doc-cert-seal-line">{t('docs.cert.seal1')}</span>
          <span className="doc-cert-seal-line">{t('docs.cert.seal2')}</span>
          <strong>{t('docs.cert.seal3')}</strong>
        </div>
      )}
      <footer className="doc-cert-foot">
        <Tag color={STATUS_COLORS[cert.status] || 'brown'} variant="soft">
          {t(`docs.certStatus.${cert.status}`)}
        </Tag>
      </footer>
    </div>
  );
}
