// 居民证预填提示:检测到本人持有有效居民证时,提供"使用居民证信息"一键预填。
// 证件号来自联动接口;持卡人姓名、邮箱与地址来自当前账户的门户身份档案
// (个人资料页),都是本人数据、无需脱敏。档案里为空的字段不预填。
// `fields` 声明目标表单真正能接收的字段:卡片里没有任何可写字段时不再渲染一个
// 按了没反应的按钮,改为直接说明"请手动填写"。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Title } from 'animal-island-ui';
import { UsersIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { profileIdentity } from '../../lib/profileIdentity.js';
import { fmtDate } from '../../lib/date.js';

export default function ResidentPrefill({ onFill, fields = null, className = '' }) {
  const { t } = useTranslation();
  const { user } = useAuth();
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

  // 证件号是真实值;holder 在联动接口里是 maskName 后的「奶***」,不能用。
  // 姓名/邮箱/地址改从门户身份档案取,保证与个人资料一致。
  const profile = profileIdentity(user);
  const available = {
    virtualId: card.cardNo,
    nickname: profile.realName,
    contact: profile.email,
    address: profile.address,
  };
  const writable = Object.fromEntries(
    Object.entries(available).filter(([k, v]) => v && (!fields || fields.includes(k)))
  );
  const fillable = Object.keys(writable).length > 0;

  const handleFill = () => {
    // 以前把脱敏姓名写进 nickname、把证件号写进 contact,等于往业务表单塞错数据。
    // 现在只预填确实可用的字段,其余留给用户自己填。
    onFill({
      ...writable,
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
          <p>{t(fillable ? 'residentPrefill.body' : 'residentPrefill.bodyNoFields', { cardNo: card.cardNo })}</p>
          <p className="muted-text">
            {t('residentPrefill.holder', { name: card.holder })} · {t('residentPrefill.type', { type: card.typeName })} ·{' '}
            {t('residentPrefill.validUntil', { date: fmtDate(card.validUntil) })}
          </p>
        </div>
        <div className="resident-prefill-actions">
          {fillable && (
            <Button type="primary" onClick={handleFill}>
              {t('residentPrefill.fill')}
            </Button>
          )}
          <Button type="text" onClick={() => setDismissed(true)}>
            {t('residentPrefill.skip')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
