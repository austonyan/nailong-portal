// 奶龙国皇家教育与科学署 Shell:署内导航 + 进入服务时的 SSO 身份确认(每个浏览器
// 会话一次,直连 URL 同样强制),与签证署 / 文旅署的 Shell 行为一致。
import './education.css';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from 'animal-island-ui';
import { BulbIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';
import { EduNav } from './shared.jsx';

export default function EduShell({ permission, children }) {
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
    <div className="edu-page">
      <div className="edu-banner">
        <div className="edu-banner-brand">
          <span className="edu-banner-emblem">
            <BulbIcon size={22} />
          </span>
          <div>
            <div className="edu-banner-name">{t('edu.officeName')}</div>
            <div className="edu-banner-sub">{t('edu.officeSub')}</div>
          </div>
        </div>
      </div>

      <EduNav />

      {children}

      <SsoConfirmModal flag="nailong.education.sso" tip={t('edu.sso.tip')} pattern="app-blue" />
    </div>
  );
}
