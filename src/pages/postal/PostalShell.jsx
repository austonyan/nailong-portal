// 邮政与通信署 shell: SSO identity confirmation (once per browser session,
// same contract as the other in-SPA services) + user/admin sub navigation.
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal } from 'animal-island-ui';
import { MailIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import './postal.css';

const SSO_FLAG = 'nailong.postal.sso';

const USER_TABS = [
  { to: '/postal', key: 'home', end: true },
  { to: '/postal/notices', key: 'notices' },
  { to: '/postal/messages', key: 'messages' },
  { to: '/postal/postcards', key: 'postcards' },
  { to: '/postal/subscription', key: 'subscription' },
];

const ADMIN_TABS = [
  { to: '/postal/admin/notices', key: 'adminNotices' },
  { to: '/postal/admin/templates', key: 'adminTemplates' },
  { to: '/postal/admin/card-templates', key: 'adminCardTemplates' },
  { to: '/postal/admin/postcards', key: 'adminPostcards' },
  { to: '/postal/admin/stats', key: 'adminStats' },
  { to: '/postal/admin/audit', key: 'adminAudit' },
];

export default function PostalShell({ permission, children }) {
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

  const navClass = ({ isActive }) => (isActive ? 'postal-nav-link active' : 'postal-nav-link');

  return (
    <div className="postal-page">
      <div className="postal-office-banner">
        <div className="postal-office-brand">
          <span className="postal-office-emblem">
            <MailIcon size={22} />
          </span>
          <div>
            <div className="postal-office-name">{t('post.officeName')}</div>
            <div className="postal-office-sub">{t('post.officeSub')}</div>
          </div>
        </div>
      </div>

      <nav className="postal-nav" aria-label={t('post.officeName')}>
        {USER_TABS.map((tab) => (
          <NavLink key={tab.key} to={tab.to} end={tab.end} className={navClass}>
            {t(`post.nav.${tab.key}`)}
          </NavLink>
        ))}
        {can('post:manage') && (
          <>
            <span className="postal-nav-divider" aria-hidden="true" />
            {ADMIN_TABS.map((tab) => (
              <NavLink key={tab.key} to={tab.to} className={navClass}>
                {t(`post.nav.${tab.key}`)}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {children}

      <Modal
        maskClosable={false}
        open={ssoOpen}
        title={t('post.sso.title')}
        onClose={cancelSso}
        typewriter={false}
        footer={
          <>
            <Button onClick={cancelSso}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={confirmSso}>
              {t('post.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="postal-sso-body">
          <Card pattern="app-blue">
            <div className="postal-sso-identity">
              <Avatar size="large">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <div>
                <div className="postal-sso-name">{user?.displayName || user?.username}</div>
                <div className="postal-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('post.sso.tip')}</p>
        </div>
      </Modal>
    </div>
  );
}