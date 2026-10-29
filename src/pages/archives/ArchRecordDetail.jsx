// 归档记录详情 — 只读展示脱敏字段,并提供前往原署页面的链接。
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, ExternalLinkIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { ArchNav, OfficeTag, RecordStatusTag, fmtDate, fmtDateTime, toastArchError } from './shared.jsx';

// 详情字段是服务端按 [key, value, mask] 组成的;status 是状态码、date 是 ISO 时间,
// 直接 String(value) 会把 `pending_review` 和完整 ISO 串显示给用户。
const STATUS_FIELDS = new Set(['status']);
const DATE_TIME_FIELDS = new Set(['submittedAt', 'issuedAt']);
const DATE_FIELDS = new Set(['validUntil', 'planArrive', 'planLeave', 'entryDate', 'exitDate']);

export default function ArchRecordDetail() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { type, id } = useParams();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);

  // 状态码走 arch.recStatus.*;日期字段统一按 dayjs 本地时区格式化;其余字段
  // 在繁中界面优先用服务端给的 valueTw(目录名一类的内容是双语列)。
  const fieldValue = (field) => {
    const raw = field.value;
    if (raw === '' || raw == null) return '-';
    if (STATUS_FIELDS.has(field.key)) {
      return t(`arch.recStatus.${raw}`, { defaultValue: t('common.unknown') });
    }
    if (DATE_TIME_FIELDS.has(field.key)) return fmtDateTime(raw);
    if (DATE_FIELDS.has(field.key)) return fmtDate(raw);
    if (String(i18n.language || '').startsWith('zh-TW') && field.valueTw) return String(field.valueTw);
    return String(raw);
  };

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
        <Title size="middle" color="brown">
          {t('arch.detail.title')}
        </Title>
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
              <h3>{data.recordType?.name || t(`arch.recordType.${type}`, { defaultValue: t('common.unknown') })}</h3>
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
                  <div className="arch-detail-key">{t(`arch.field.${field.key}`, { defaultValue: t('common.unknown') })}</div>
                  <div className="arch-detail-value">{fieldValue(field)}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card color="app-teal" className="arch-tag-row">
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