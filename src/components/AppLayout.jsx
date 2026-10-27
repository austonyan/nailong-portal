// 应用外壳:
//   管理员  —— 左侧多级侧栏(署 → 管理台) + 细顶栏(面包屑/站内信/语言/账号)
//   普通用户 —— 无侧栏,顶栏只留品牌与账号操作,导航仍从门户服务卡进入
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Drawer } from 'animal-island-ui';
import { ChevronRightIcon, MenuIcon, PowerIcon, SailboatIcon } from 'naive-icons';
import { useAuth } from '../auth/AuthContext.jsx';
import LanguageSelect from './LanguageSelect.jsx';
import Sidebar from './Sidebar.jsx';
import InboxDrawer from './InboxDrawer.jsx';
import { breadcrumbKeys, isPortalAdmin } from '../nav/navConfig.js';

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, logout, can, hasRole } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const showSider = isPortalAdmin({ can, hasRole });
  const crumbs = showSider ? breadcrumbKeys(pathname) : [];

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const displayName = user?.displayName || user?.username || '';

  return (
    <div className="app-shell">
      {showSider && <Sidebar />}

      <div className="app-body">
        <header className="app-header">
          <div className="app-header-inner">
            {showSider ? (
              <>
                <Button
                  className="app-menu-btn"
                  type="text"
                  size="small"
                  icon={<MenuIcon />}
                  onClick={() => setDrawerOpen(true)}
                  aria-label={t('nav.menu')}
                />
                <nav className="app-crumbs" aria-label={t('nav.menu')}>
                  {crumbs.map((key, index) => (
                    <span
                      key={`${key}-${index}`}
                      className={index === crumbs.length - 1 ? 'crumb current' : 'crumb'}
                    >
                      {index > 0 && <ChevronRightIcon size={12} />}
                      <span>{t(key)}</span>
                    </span>
                  ))}
                </nav>
              </>
            ) : (
              <NavLink to="/" className="brand">
                <SailboatIcon size={26} className="brand-icon" />
                <span>{t('app.name')}</span>
              </NavLink>
            )}

            <div className="header-right">
              <InboxDrawer />
              <LanguageSelect />
              <NavLink to="/profile" className="user-chip" title={t('nav.profile')}>
                <Avatar size="small">{displayName.slice(0, 1) || '?'}</Avatar>
                <span className="user-chip-name">{displayName}</span>
              </NavLink>
              <Button
                type="text"
                size="small"
                icon={<PowerIcon />}
                onClick={handleLogout}
                aria-label={t('nav.logout')}
              >
                <span className="logout-label">{t('nav.logout')}</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="app-main">
          <Outlet />
        </main>

        <footer className="app-footer muted-text">
          {t('app.name')} · {new Date().getFullYear()}
        </footer>
      </div>

      {showSider && (
        <Drawer
          open={drawerOpen}
          title={t('nav.menu')}
          placement="left"
          width={280}
          maskClosable={false}
          pushBackground={false}
          footer={null}
          onClose={() => setDrawerOpen(false)}
        >
          <Sidebar embedded onNavigate={() => setDrawerOpen(false)} />
        </Drawer>
      )}
    </div>
  );
}