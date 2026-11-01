// 皇家档案与记录署 shell: office banner, sub navigation and the SSO identity
// confirmation the unified portal shows before entering the service (once per
// browser session, direct URLs included).
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { BookIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';
import { ArchNav } from './shared.jsx';
import './archives.css';

export default function ArchShell({ permission = 'arch:portal', admin = false, children }) {
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

      <SsoConfirmModal flag="nailong.archives.sso" tip={t('arch.sso.tip')} />
    </div>
  );
}