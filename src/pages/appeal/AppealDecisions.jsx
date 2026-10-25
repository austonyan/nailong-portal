// 我的决定书:申诉与复核产生的处理决定书列表(有效/已撤销/已失效)。
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag, Title } from 'animal-island-ui';
import { EyeIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { DECISION_STATUS_COLORS, DECISION_TYPE_COLORS, fmtDateTime, toastAppealError } from './shared.jsx';

export default function AppealDecisions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/appeal/decisions');
      setItems(data.items);
    } catch (err) {
      toastAppealError(t, err);
      setItems([]);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="appeal-list-page">
      <div className="page-header">
        <Title size="middle">{t('appeal.decision.title')}</Title>
      </div>

      {items === null && (
        <Card type="dashed">
          <p className="muted-text">{t('common.loading')}</p>
        </Card>
      )}
      {items !== null && items.length === 0 && (
        <Card type="dashed">
          <p className="muted-text">{t('common.empty')}</p>
        </Card>
      )}

      {(items ?? []).map((d) => (
        <Card key={d.id} hoverable className="appeal-item-card" onClick={() => navigate(`/appeal/decisions/${d.code}`)}>
          <div className="appeal-item-head">
            <strong>{d.code}</strong>
            <Tag color={DECISION_STATUS_COLORS[d.status] || 'default'} variant="soft">
              {t(`appeal.decisionStatus.${d.status}`)}
            </Tag>
            <Tag color={DECISION_TYPE_COLORS[d.decisionType] || 'default'} variant="outlined">
              {t(`appeal.decisionType.${d.decisionType}`)}
            </Tag>
          </div>
          <p className="muted-text">
            {t('appeal.decision.forAppeal', { no: d.appealCode })}
            {d.reviewCode ? ` · ${t('appeal.decision.fromReview', { no: d.reviewCode })}` : ''} ·{' '}
            {t('appeal.decision.effectiveAt', { time: fmtDateTime(d.effectiveAt) })}
          </p>
          <p className="appeal-item-reason">{d.reason}</p>
          <div className="appeal-item-actions" onClick={(e) => e.stopPropagation()}>
            <Button type="text" size="small" icon={<EyeIcon />} onClick={() => navigate(`/appeal/decisions/${d.code}`)}>
              {t('appeal.decision.view')}
            </Button>
            <Button type="text" size="small" onClick={() => navigate('/appeal/verify')}>
              {t('appeal.decision.verify')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
