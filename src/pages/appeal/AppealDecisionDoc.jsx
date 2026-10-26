// 处理决定书:二维码验真与打印(打印 CSS)。
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Button, Card, Tag } from 'animal-island-ui';
import { PrinterIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { DECISION_STATUS_COLORS, DECISION_TYPE_COLORS, fmtDateTime, toastAppealError } from './shared.jsx';

export default function AppealDecisionDoc() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const [doc, setDoc] = useState(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    api
      .get(`/appeal/decisions/${params.code}`)
      .then((data) => setDoc(data.decision))
      .catch((err) => {
        toastAppealError(t, err);
        navigate('/appeal/decisions');
      });
  }, [params.code, t, navigate]);

  useEffect(() => {
    if (!doc) return;
    const url = `${window.location.origin}/appeal/verify?token=${doc.verifyToken}`;
    QRCode.toDataURL(url, { width: 160, margin: 1 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [doc]);

  if (!doc) {
    return (
      <Card type="dashed">
        <p className="muted-text">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div className="appeal-doc-page">
      <div className="table-actions appeal-doc-toolbar no-print">
        <Button onClick={() => navigate('/appeal/decisions')}>{t('appeal.back')}</Button>
        <Button type="primary" icon={<PrinterIcon />} onClick={() => window.print()}>
          {t('appeal.doc.print')}
        </Button>
      </div>

      <Card className="appeal-doc-paper">
        <div className="appeal-doc-head">
          <h2>{t('appeal.doc.title')}</h2>
          <p className="muted-text">{t('appeal.officeName')} · {t('appeal.officeSub')}</p>
        </div>
        <p className="appeal-doc-no">{t('appeal.doc.noLabel')}: {doc.code}</p>
        <dl className="appeal-field-list appeal-doc-body">
          <div>
            <dt>{t('appeal.doc.appealLabel')}</dt>
            <dd>
              {doc.appealCode} · {t(`appeal.bizType.${doc.bizType}`)}
            </dd>
          </div>
          <div>
            <dt>{t('appeal.doc.decisionLabel')}</dt>
            <dd>
              <Tag color={DECISION_TYPE_COLORS[doc.decisionType] || 'default'} variant="soft">
                {t(`appeal.decisionType.${doc.decisionType}`)}
              </Tag>
              <Tag color={DECISION_STATUS_COLORS[doc.status] || 'default'} variant="soft">
                {t(`appeal.decisionStatus.${doc.status}`)}
              </Tag>
            </dd>
          </div>
          <div>
            <dt>{t('appeal.doc.reasonLabel')}</dt>
            <dd>{doc.reason}</dd>
          </div>
          {doc.basis && (
            <div>
              <dt>{t('appeal.doc.basisLabel')}</dt>
              <dd>{doc.basis}</dd>
            </div>
          )}
          <div>
            <dt>{t('appeal.doc.effectiveLabel')}</dt>
            <dd>{fmtDateTime(doc.effectiveAt)}</dd>
          </div>
          {doc.certCode && (
            <div>
              <dt>{t('appeal.doc.certCodeLabel')}</dt>
              <dd>{doc.certCode}</dd>
            </div>
          )}
          {doc.reviewCode && (
            <div>
              <dt>{t('appeal.doc.reviewLabel')}</dt>
              <dd>{doc.reviewCode}</dd>
            </div>
          )}
        </dl>
        <div className="appeal-doc-footer">
          <div className="appeal-doc-footer-note">
            <p className="muted-text">{t('appeal.doc.verifyTip', { no: doc.code })}</p>
          </div>
          {qr && <img className="appeal-doc-qr" src={qr} alt={t('appeal.doc.qrAlt')} />}
        </div>
      </Card>
    </div>
  );
}
