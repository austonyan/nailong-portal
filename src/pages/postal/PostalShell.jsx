// 邮政与通信署 shell: SSO identity confirmation (once per browser session,
// same contract as the other in-SPA services) + user/admin sub navigation.
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { MailIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';
import './postal.css';

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
  const { can } = useAuth();
  const navigate = useNavigate();

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

      <SsoConfirmModal flag="nailong.postal.sso" tip={t('post.sso.tip')} pattern="app-blue" />
    </div>
  );
}