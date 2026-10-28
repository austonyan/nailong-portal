// 居民证预填提示:检测到本人持有有效居民证时,提供"使用居民证信息"一键预填,
// 把持卡人姓名与证件号回填到签注/入境/文书等申请表单,降低重复录入。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Title } from 'animal-island-ui';
import { UsersIcon } from 'naive-icons';
import { api } from '../../api/client.js';

export default function ResidentPrefill({ onFill, className = '' }) {
  const { t } = useTranslation();
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api
      .get('/linkage/identity')
      .then((data) => {
        setIdentity(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const card =
    !dismissed && identity && identity.basis === 'resident_card' && identity.cardStatus === 'valid'
      ? identity
      : null;
  if (!card || loading) return null;

  const handleFill = () => {
    onFill({
      nickname: card.holder,
      contact: card.cardNo,
      virtualId: card.cardNo,
      cardNo: card.cardNo,
      holder: card.holder,
      typeName: card.typeName,
      validUntil: card.validUntil,
    });
    setDismissed(true);
  };

  return (
    <Card type="dashed" className={`resident-prefill ${className}`.trim()}>
      <Title variant="layer" color="app-teal" size="small">
        {t('residentPrefill.title')}
      </Title>
      <div className="resident-prefill-body">
        <UsersIcon />
        <div className="resident-prefill-text">
          <p>{t('residentPrefill.body', { cardNo: card.cardNo })}</p>
          <p className="muted-text">
            {t('residentPrefill.holder', { name: card.holder })} · {t('residentPrefill.type', { type: card.typeName })} ·{' '}
            {t('residentPrefill.validUntil', { date: card.validUntil })}
          </p>
        </div>
        <div className="resident-prefill-actions">
          <Button type="primary" onClick={handleFill}>
            {t('residentPrefill.fill')}
          </Button>
          <Button type="text" onClick={() => setDismissed(true)}>
            {t('residentPrefill.skip')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
