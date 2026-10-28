// 居民证预填提示:检测到本人持有有效居民证时,提供"使用居民证信息"一键预填。
// 只回填服务端确认为真实值的字段(居民证件号 → 虚拟身份信息);持卡人姓名在
// 联动接口里是脱敏的,联系方式不下发,这两项一律不预填。
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
    // /api/linkage/identity 里只有 cardNo 是真实值:holder 走 maskName(脱敏成「奶***」),
    // 联系方式服务端根本不提供。以前把脱敏姓名写进 nickname、把证件号写进 contact,
    // 等于往业务表单塞错数据。现在只预填确实可用的字段,其余留给用户自己填。
    onFill({
      virtualId: card.cardNo,
      cardNo: card.cardNo,
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
