import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button } from 'animal-island-ui';
import { PowerIcon, SailboatIcon } from 'naive-icons';
import { useAuth } from '../auth/AuthContext.jsx';
import LanguageSelect from './LanguageSelect.jsx';

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
            {can('imm:portal') && (
              <NavLink to="/immigration" className={navClass}>
                {t('nav.immigration')}
              </NavLink>
            )}
            {can('dip:portal') && (
              <NavLink to="/dip" className={navClass}>
                {t('nav.diplomacy')}
              </NavLink>
            )}
            {can('evt:portal') && (
              <NavLink to="/protocol" className={navClass}>
                {t('nav.protocol')}
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
            {(can('imm:inspect') || can('imm:admin') || can('imm:verify')) && (
              <NavLink to="/admin/immigration/ports" className={navClass}>
                {t('nav.immigrationAdmin')}
              </NavLink>
            )}
            {(can('dip:review') || can('dip:admin')) && (
              <NavLink to="/admin/dip/review" className={navClass}>
                {t('nav.diplomacyAdmin')}
              </NavLink>
            )}
            {(can('evt:review') || can('evt:manage') || can('evt:checkin')) && (
              <NavLink to={can('evt:review') || can('evt:manage') ? '/protocol/admin/review' : '/protocol/admin/checkin'} className={navClass}>
                {t('nav.protocolAdmin')}
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
