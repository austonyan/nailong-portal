// Visa service shell: sub navigation + the SSO identity confirmation that the
// unified portal shows before entering the service (once per browser session).
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal, Tag } from 'animal-island-ui';
import { BadgeCheckIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';

const SSO_FLAG = 'nailong.visa.sso';

export default function VisaShell({ permission, children }) {
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

  const navClass = ({ isActive }) => (isActive ? 'visa-nav-link active' : 'visa-nav-link');

  return (
    <div className="visa-page">
      <div className="visa-office-banner">
        <div className="visa-office-brand">
          <span className="visa-office-emblem">
            <BadgeCheckIcon size={22} />
          </span>
          <div>
            <div className="visa-office-name">{t('visa.officeName')}</div>
            <div className="visa-office-sub">{t('visa.officeSub')}</div>
          </div>
        </div>
        <Tag color="app-yellow" variant="soft">
          {t('visa.disclaimerTag')}
        </Tag>
      </div>

      <nav className="visa-nav" aria-label={t('visa.officeName')}>
        <NavLink to="/visa" end className={navClass}>
          {t('visa.nav.home')}
        </NavLink>
        <NavLink to="/visa/applications" className={navClass}>
          {t('visa.nav.applications')}
        </NavLink>
        <NavLink to="/visa/permits" className={navClass}>
          {t('visa.nav.permits')}
        </NavLink>
        <NavLink to="/visa/messages" className={navClass}>
          {t('visa.nav.messages')}
        </NavLink>
        {can('visa:review') && (
          <NavLink to="/visa/admin/workbench" className={navClass}>
            {t('visa.nav.workbench')}
          </NavLink>
        )}
        {can('visa:manage') && (
          <NavLink to="/visa/admin/manage" className={navClass}>
            {t('visa.nav.manage')}
          </NavLink>
        )}
      </nav>

      {children}

      <Modal
        open={ssoOpen}
        title={t('visa.sso.title')}
        onClose={cancelSso}
        typewriter={false}
        footer={
          <>
            <Button onClick={cancelSso}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={confirmSso}>
              {t('visa.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="visa-sso-body">
          <Card color="app-teal" className="visa-sso-card">
            <div className="visa-sso-identity">
              <Avatar size="large">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <div>
                <div className="visa-sso-name">{user?.displayName || user?.username}</div>
                <div className="visa-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('visa.sso.tip')}</p>
        </div>
      </Modal>
    </div>
  );
}
