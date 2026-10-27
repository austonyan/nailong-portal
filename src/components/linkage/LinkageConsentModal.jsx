// 跨署取数授权弹窗 — 与进入服务时的 SSO 身份确认同形,但内容针对"从哪个署取什么信息"。
// 确认后仅在当前浏览器会话记住(nailong.<consumer>.linkage.<source>)。
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal, Skeleton } from 'animal-island-ui';
import { ShieldIcon } from 'naive-icons';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

export default function LinkageConsentModal({ open, consumer, source, credentialLabel, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    api
      .get('/linkage/identity')
      .then((data) => {
        if (alive) setIdentity(data);
      })
      .catch(() => {
        if (alive) setIdentity(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const displayName = identity?.displayName || user?.displayName || user?.username || '';
  const username = identity?.username || user?.username || '';
  const credential = credentialLabel || t(`linkage.credential.${source}`);
  const residentCard = identity?.basis === 'resident_card';

  return (
    <Modal
      maskClosable={false}
      open={open}
      title={t('linkage.consent.title')}
      onClose={onCancel}
      typewriter={false}
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<ShieldIcon />} onClick={onConfirm}>
            {t('linkage.consent.confirm')}
          </Button>
        </>
      }
    >
      <div className="linkage-consent-body">
        <Card color="app-teal" className="linkage-consent-card">
          <div className="linkage-consent-identity">
            <Avatar size="large">{displayName.slice(0, 1)}</Avatar>
            <div>
              <div className="linkage-consent-name">{displayName}</div>
              <div className="linkage-consent-account">@{username}</div>
            </div>
          </div>
        </Card>
        {loading ? (
          <Skeleton variant="text" width="70%" />
        ) : (
          <p className="linkage-consent-basis">
            {residentCard
              ? t('linkage.consent.identityResident', {
                  cardNo: identity.cardNo,
                  holder: identity.holder,
                })
              : t('linkage.consent.identitySso', { username })}
          </p>
        )}
        <p className="linkage-consent-question">
          {t('linkage.consent.body', {
            consumer: t(`linkage.consumer.${consumer}`),
            source: t(`linkage.office.${source}`),
            credential,
          })}
        </p>
        <p className="muted-text">{t('linkage.consent.tip')}</p>
      </div>
    </Modal>
  );
}