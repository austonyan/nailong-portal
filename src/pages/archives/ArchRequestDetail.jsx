// 删除申请详情 — 状态时间线、执行回执与驳回申诉指引。
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { ArrowLeftIcon, ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { ArchNav, RequestStatusTag, fmtDateTime, toastArchError } from './shared.jsx';

export default function ArchRequestDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/archives/deletion-requests/${id}`)
      .then((data) => setRequest(data.request))
      .catch((err) => {
        toastArchError(err);
        setMissing(true);
      });
  }, [id]);

  useEffect(load, [load]);

  return (
    <div className="arch-page">
      <ArchNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="brown">
            {t('arch.request.detailTitle')}
          </Title>
        </h1>
        <div className="table-actions">
          <Button type="text" icon={<ArrowLeftIcon />} onClick={() => navigate('/archives/requests')}>
            {t('arch.detail.back')}
          </Button>
        </div>
      </div>

      {missing && (
        <Card type="dashed">
          <p className="arch-empty">{t('arch.request.notFound')}</p>
        </Card>
      )}

      {request && (
        <>
          <Card>
            <div className="arch-type-head">
              <h2>{request.no}</h2>
              <RequestStatusTag value={request.status} />
            </div>
            <div className="arch-summary arch-detail-summary">
              <div className="arch-summary-row">
                <span>{t('common.createdAt')}</span>
                <span>{fmtDateTime(request.createdAt)}</span>
              </div>
              <div className="arch-summary-row">
                <span>{t('arch.request.scope')}</span>
                <span className="arch-tag-row">
                  {(request.scopeTypes ?? []).map((type) => (
                    <Tag key={type.code} variant="soft" size="small">
                      {type.name}
                    </Tag>
                  ))}
                </span>
              </div>
              <div className="arch-summary-row">
                <span>{t('arch.request.impact')}</span>
                <span>{request.impact}</span>
              </div>
              {request.reason && (
                <div className="arch-summary-row">
                  <span>{t('arch.request.reason')}</span>
                  <span>{request.reason}</span>
                </div>
              )}
              {request.reviewNote && (
                <div className="arch-summary-row">
                  <span>{t('arch.request.reviewNote')}</span>
                  <span>{request.reviewNote}</span>
                </div>
              )}
              {request.status === 'rejected' && request.rejectReason && (
                <div className="arch-summary-row">
                  <span>{t('arch.request.rejectReason')}</span>
                  <span>{request.rejectReason}</span>
                </div>
              )}
              {request.status === 'completed' && (
                <>
                  <div className="arch-summary-row">
                    <span>{t('arch.request.receipt')}</span>
                    <span>{request.receiptNo}</span>
                  </div>
                  <div className="arch-summary-row">
                    <span>{t('arch.request.affected')}</span>
                    <span>{t('arch.request.affectedValue', { count: request.affectedCount })}</span>
                  </div>
                  <div className="arch-summary-row">
                    <span>{t('arch.request.completedAt')}</span>
                    <span>{fmtDateTime(request.completedAt)}</span>
                  </div>
                </>
              )}
            </div>
          </Card>

          {request.status === 'rejected' && (
            <Card pattern="app-orange" className="arch-tag-row">
              <ShieldIcon size={18} />
              <span>{t('arch.request.appealHint')}</span>
              <Link to="/appeal">
                <Button type="primary" size="small">
                  {t('arch.request.goAppeal')}
                </Button>
              </Link>
            </Card>
          )}

          <Card>
            <Title size="small" color="brown">
              {t('arch.request.timeline')}
            </Title>
            <div className="arch-timeline arch-timeline-gap">
              {(request.events ?? []).map((event) => (
                <div key={event.id} className="arch-timeline-item">
                  <div className="arch-timeline-head">
                    <Tag color="app-blue" variant="soft" size="small">
                      {t(`arch.event.${event.action}`, { defaultValue: t('common.unknown') })}
                    </Tag>
                    <span className="arch-timeline-time">{fmtDateTime(event.createdAt)}</span>
                    {event.actorName && <span className="muted-text">{event.actorName}</span>}
                  </div>
                  {event.note && <p className="arch-timeline-note">{event.note}</p>}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}