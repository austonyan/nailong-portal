import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Select } from 'animal-island-ui';
import { PowerIcon, SailboatIcon } from 'naive-icons';
import { useAuth } from '../auth/AuthContext.jsx';
import { setLanguage, REQUIRED_LOCALES } from '../i18n/index.js';

const LOCALE_LABELS = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文' };

function LanguageSelect() {
  const { i18n, t } = useTranslation();
  return (
    <div className="language-select" role="group" aria-label={t('nav.language')}>
      <Select
        value={REQUIRED_LOCALES.includes(i18n.language) ? i18n.language : 'zh-CN'}
        onChange={setLanguage}
        options={REQUIRED_LOCALES.map((lng) => ({ key: lng, label: LOCALE_LABELS[lng] ?? lng }))}
      />
    </div>
  );
}

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="brand">
            <SailboatIcon size={26} className="brand-icon" />
            <span>{t('app.name')}</span>
          </NavLink>
          <nav className="app-nav" aria-label={t('app.name')}>
            <NavLink to="/" end className={navClass}>
              {t('nav.portal')}
            </NavLink>
            {can('visa:apply') && (
              <NavLink to="/visa" className={navClass}>
                {t('nav.visa')}
              </NavLink>
            )}
            {can('docs:apply') && (
              <NavLink to="/docs" className={navClass}>
                {t('nav.docs')}
              </NavLink>
            )}
            <NavLink to="/profile" className={navClass}>
              {t('nav.profile')}
            </NavLink>
            {can('users:read') && (
              <NavLink to="/admin/users" className={navClass}>
                {t('nav.users')}
              </NavLink>
            )}
            {can('roles:read') && (
              <NavLink to="/admin/roles" className={navClass}>
                {t('nav.roles')}
              </NavLink>
            )}
            {can('services:read') && (
              <NavLink to="/admin/services" className={navClass}>
                {t('nav.services')}
              </NavLink>
            )}
            {can('docs:certify') && (
              <NavLink to="/admin/docs/review" className={navClass}>
                {t('nav.docsReview')}
              </NavLink>
            )}
          </nav>
          <div className="header-right">
            <LanguageSelect />
            <NavLink to="/profile" className="user-chip" title={t('nav.profile')}>
              <Avatar size="small">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <span className="user-chip-name">{user?.displayName || user?.username}</span>
            </NavLink>
            <Button type="text" size="small" icon={<PowerIcon />} onClick={handleLogout}>
              {t('nav.logout')}
            </Button>
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer muted-text">{t('app.name')} · {new Date().getFullYear()}</footer>
    </div>
  );
}
