// 外交署 shell: SSO 身份确认(每次浏览器会话一次) + 署横幅 + 子导航。
// 与 VisaShell 同款交互:直接输 URL 进入也会先确认身份。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal } from 'animal-island-ui';
import { CompassIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';

const SSO_FLAG = 'nailong.dip.sso';

export default function DipShell({ permission, children }) {
  const { t } = useTranslation();
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [ssoOpen, setSsoOpen] = useState(() => sessionStorage.getItem(SSO_FLAG) !== '1');

  if (permission && !can(permission)) {
    return (
      <div className="center-screen">
        <h2>{t('errors.forbiddenTitle')}</h2>
        <p className="muted-text">{t('errors.forbiddenTip')}</p>
        <Button type="primary" onClick={() => navigate('/')}>
          {t('errors.backHome')}
        </Button>
      </div>
    );
  }

  const confirmSso = () => {
    sessionStorage.setItem(SSO_FLAG, '1');
    setSsoOpen(false);
  };

  const cancelSso = () => {
    setSsoOpen(false);
    navigate('/');
  };

  return (
    <div className="dip-page">
      <div className="dip-banner">
        <div className="dip-banner-brand">
          <span className="dip-banner-emblem">
            <CompassIcon size={22} />
          </span>
          <div>
            <div className="dip-banner-name">{t('dip.officeName')}</div>
            <div className="dip-banner-sub">{t('dip.officeSub')}</div>
          </div>
        </div>
      </div>

      {children}

      <Modal
        maskClosable={false}
        open={ssoOpen}
        title={t('dip.sso.title')}
        onClose={cancelSso}
        typewriter={false}
        footer={
          <>
            <Button onClick={cancelSso}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={confirmSso}>
              {t('dip.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="dip-sso-body">
          <Card pattern="purple" className="dip-sso-card">
            <div className="dip-sso-identity">
              <Avatar size="large">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <div>
                <div className="dip-sso-name">{user?.displayName || user?.username}</div>
                <div className="dip-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('dip.sso.tip')}</p>
        </div>
      </Modal>
    </div>
  );
}
