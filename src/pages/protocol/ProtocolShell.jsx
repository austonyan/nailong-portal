// 礼宾与活动署 shell: SSO identity confirmation (once per browser session,
// same contract as the other in-SPA services) + user/admin sub navigation.
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal, Tag } from 'animal-island-ui';
import { BadgeCheckIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import './protocol.css';

const SSO_FLAG = 'nailong.protocol.sso';

const USER_TABS = [
  { to: '/protocol', key: 'home', end: true },
  { to: '/protocol/events', key: 'events' },
  { to: '/protocol/registrations', key: 'registrations' },
  { to: '/protocol/invitations', key: 'invitations' },
  { to: '/protocol/passes', key: 'passes' },
  { to: '/protocol/hosts', key: 'hosts' },
  { to: '/protocol/courtesy', key: 'courtesy' },
  { to: '/protocol/messages', key: 'messages' },
  { to: '/protocol/help', key: 'help' },
];

const ADMIN_TABS = [
  { to: '/protocol/admin/review', key: 'review', perms: ['evt:review', 'evt:manage'] },
  { to: '/protocol/admin/events', key: 'adminEvents', perms: ['evt:manage'] },
  { to: '/protocol/admin/issuance', key: 'issuance', perms: ['evt:manage'] },
  { to: '/protocol/admin/hosts', key: 'adminHosts', perms: ['evt:review', 'evt:manage'] },
  { to: '/protocol/admin/courtesy', key: 'adminCourtesy', perms: ['evt:review', 'evt:manage'] },
  { to: '/protocol/admin/checkin', key: 'checkin', perms: ['evt:checkin', 'evt:manage'] },
  { to: '/protocol/admin/manage', key: 'manage', perms: ['evt:manage'] },
  { to: '/protocol/admin/stats', key: 'stats', perms: ['evt:manage'] },
  { to: '/protocol/admin/audit', key: 'audit', perms: ['evt:manage'] },
];

export default function ProtocolShell({ permission, variant = 'user', children }) {
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
  const navClass = ({ isActive }) => (isActive ? 'protocol-nav-link active' : 'protocol-nav-link');
  const tabs = variant === 'admin' ? ADMIN_TABS : USER_TABS;

  return (
    <div className="protocol-page">
      <div className="protocol-office-banner">
        <div className="protocol-office-brand">
          <span className="protocol-office-emblem">
            <BadgeCheckIcon size={22} />
          </span>
          <div>
            <div className="protocol-office-name">{t('protocol.officeName')}</div>
            <div className="protocol-office-sub">{t('protocol.officeSub')}</div>
          </div>
        </div>
        <div className="protocol-banner-right">
          {variant === 'admin' ? (
            <Button type="text" size="small" onClick={() => navigate('/protocol')}>
              {t('protocol.nav.frontDesk')}
            </Button>
          ) : (
            (can('evt:review') || can('evt:manage') || can('evt:checkin')) && (
              <Button type="dashed" size="small" onClick={() => navigate('/protocol/admin/review')}>
                {t('protocol.nav.workbench')}
              </Button>
            )
          )}
        </div>
      </div>

      <nav className="protocol-nav" aria-label={t('protocol.officeName')}>
        {tabs.map((tab) => {
          if (tab.perms && !tab.perms.some((p) => can(p))) return null;
          return (
            <NavLink key={tab.key} to={tab.to} end={tab.end} className={navClass}>
              {t(`protocol.nav.${tab.key}`)}
            </NavLink>
          );
        })}
      </nav>

      {children}

      <Modal
        open={ssoOpen}
        title={t('protocol.sso.title')}
        onClose={cancelSso}
        typewriter={false}
        footer={
          <>
            <Button onClick={cancelSso}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={confirmSso}>
              {t('protocol.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="protocol-sso-body">
          <Card color="app-teal">
            <div className="protocol-sso-identity">
              <Avatar size="large">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <div>
                <div className="protocol-sso-name">{user?.displayName || user?.username}</div>
                <div className="protocol-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('protocol.sso.tip')}</p>
        </div>
      </Modal>
    </div>
  );
}