// 外交署 shell: SSO 身份确认(每次浏览器会话一次) + 署横幅 + 子导航。
// 与 VisaShell 同款交互:直接输 URL 进入也会先确认身份。
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { CompassIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';

export default function DipShell({ permission, children }) {
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

      <SsoConfirmModal flag="nailong.dip.sso" tip={t('dip.sso.tip')} pattern="purple" />
    </div>
  );
}
