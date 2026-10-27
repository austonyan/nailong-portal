// 奶龙国皇家教育与科学署 Shell:署内导航 + 进入服务时的 SSO 身份确认(每个浏览器
// 会话一次,直连 URL 同样强制),与签证署 / 文旅署的 Shell 行为一致。
import './education.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal } from 'animal-island-ui';
import { BulbIcon } from 'naive-icons';
import { useAuth } from '../../auth/AuthContext.jsx';
import { EduNav } from './shared.jsx';

const SSO_FLAG = 'nailong.education.sso';

export default function EduShell({ permission, children }) {
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

      <Modal
        maskClosable={false}
        open={ssoOpen}
        title={t('edu.sso.title')}
        onClose={cancelSso}
        typewriter={false}
        footer={
          <>
            <Button onClick={cancelSso}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={confirmSso}>
              {t('edu.sso.confirm')}
            </Button>
          </>
        }
      >
        <div className="edu-sso-body">
          <Card color="app-blue" className="edu-sso-card">
            <div className="edu-sso-identity">
              <Avatar size="large">{(user?.displayName || user?.username || '?').slice(0, 1)}</Avatar>
              <div>
                <div className="edu-sso-name">{user?.displayName || user?.username}</div>
                <div className="edu-sso-account">@{user?.username}</div>
              </div>
            </div>
          </Card>
          <p className="muted-text">{t('edu.sso.tip')}</p>
        </div>
      </Modal>
    </div>
  );
}
