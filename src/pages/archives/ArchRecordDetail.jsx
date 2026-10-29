// 归档记录详情 — 只读展示脱敏字段,并提供前往原署页面的链接。
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, ExternalLinkIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { ArchNav, OfficeTag, RecordStatusTag, fmtDate, toastArchError } from './shared.jsx';

export default function ArchRecordDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { type, id } = useParams();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/archives/records/${type}/${id}`)
      .then((res) => setData(res))
      .catch((err) => {
        toastArchError(err);
        setMissing(true);
      });
  }, [type, id]);

  useEffect(load, [load]);

  return (
    <div className="arch-page">
      <ArchNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="brown">
            {t('arch.detail.title')}
          </Title>
        </h1>
        <div className="table-actions">
          <Button type="text" icon={<ArrowLeftIcon />} onClick={() => navigate('/archives/records')}>
            {t('arch.detail.back')}
          </Button>
        </div>
      </div>

      {missing && (
        <Card type="dashed">
          <p className="arch-empty">{t('arch.detail.notFound')}</p>
        </Card>
      )}

      {data?.record && (
        <>
          <Card>
            <div className="arch-type-head">
              <h2>{data.recordType?.name || data.record.recordType}</h2>
              <div className="arch-tag-row">
                <OfficeTag office={data.record.office} />
                <RecordStatusTag value={data.record.status} />
              </div>
            </div>
            <div className="arch-tag-row arch-detail-meta">
              <Tag color="brown" variant="soft" size="small">
                {t('arch.catalog.no')}: {data.record.no}
              </Tag>
              <Tag variant="soft" size="small">
                {t('arch.catalog.date')}: {fmtDate(data.record.date)}
              </Tag>
            </div>
            <p className="arch-note arch-detail-tip">
              <ShieldIcon size={12} /> {t('arch.detail.maskedTip')}
            </p>
            <div className="arch-detail-grid">
              {(data.record.fields ?? []).map((field) => (
                <div key={field.key} className="arch-detail-item">
                  <div className="arch-detail-key">{t(`arch.field.${field.key}`, { defaultValue: field.key })}</div>
                  <div className="arch-detail-value">{field.value === '' || field.value == null ? '-' : String(field.value)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card pattern="app-teal" className="arch-tag-row">
            <ExternalLinkIcon size={18} />
            <span>{t('arch.detail.sourceTip')}</span>
            <Link to={data.record.sourceUrl}>
              <Button type="primary" size="small">
                {t('arch.detail.openSource')}
              </Button>
            </Link>
          </Card>
        </>
      )}
    </div>
  );
}