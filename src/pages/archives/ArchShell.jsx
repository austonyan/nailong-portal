// 皇家档案与记录署 shell: office banner, sub navigation and the SSO identity
// confirmation the unified portal shows before entering the service (once per
// browser session, direct URLs included).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal } from 'animal-island-ui';
import { BookIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ArchNav } from './shared.jsx';
import './archives.css';

const SSO_FLAG = 'nailong.archives.sso';

export default function ArchShell({ permission = 'arch:portal', admin = false, children }) {
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
    <div className="arch-page">
      <div className="arch-banner">
        <div className="arch-brand">
          <span className="arch-emblem">
            <BookIcon size={22} />
          </span>
          <div>
            <div className="arch-name">{t('arch.officeName')}</div>
            <div className="arch-sub">{t('arch.officeSub')}</div>
          </div>
        </div>
        <div className="arch-banner-tag">{t(admin ? 'arch.bannerAdmin' : 'arch.bannerPublic')}</div>
      </div>

      <ArchNav />

      {children}

      <Modal
        maskClosable={false}
        open={ssoOpen}
        title={t('arch.sso.title')}
        onClose={cancelSso}
        typewriter={false}
        footer={
          <>
            <Button onClick={cancelSso}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={confirmSso}>
              {t('arch.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="arch-sso-body">
          <Card className="arch-sso-card">
            <div className="arch-sso-identity">
              <Avatar size="large">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <div>
                <div className="arch-sso-name">{user?.displayName || user?.username}</div>
                <div className="arch-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('arch.sso.tip')}</p>
        </div>
      </Modal>
    </div>
  );
}