// 各署进入时的单点登录身份确认弹窗(与门户服务卡入口是同一道门)。
//
// 背景:12 个业务服务都是 internal_sso,进入前要以当前门户身份确认一次,
// 每个浏览器会话只确认一次(sessionStorage 标志 `nailong.<office>.sso`,
// 门户卡入口在确认后写入同一个键,所以从门户进过一次 Shell 不再重复弹)。
// 过去这段 Modal + 身份卡在每个 Shell 里各写一份(11 份拷贝、5 份重复 CSS),
// appeal/archives 的类名甚至没有对应样式,身份块塌成竖排。这里收成一个
// 组件,身份块统一用 index.css 的 `.sso-*`;卡片底色由 pattern 传入,
// 署味说明文案由 tip 传入。
//
// 两种用法:
//   1. Shell 自管理(默认):只传 flag / tip / pattern,弹窗开关、写标志、
//      取消回门户首页都由组件处理:
//        <SsoConfirmModal flag="nailong.visa.sso" tip={t('visa.sso.tip')} pattern="app-teal" />
//   2. 受控(门户服务卡入口):传 open + onConfirm/onCancel,写标志与跳转
//      归调用方(标志键随目标服务变化):
//        <SsoConfirmModal
//          flag={`nailong.${s.key}.sso`} open={ssoService !== null} service={ssoService?.name}
//          onCancel={closeSso}
//          onConfirm={(flagKey) => { sessionStorage.setItem(flagKey, '1'); navigate(url); }} />
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Modal } from 'animal-island-ui';
import { useAuth } from '../auth/AuthContext.jsx';

export default function SsoConfirmModal({
  flag,
  tip,
  pattern,
  service,
  open: openProp,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [openState, setOpenState] = useState(() => sessionStorage.getItem(flag) !== '1');

  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const displayName = user?.displayName || user?.username || '';

  const confirm = () => {
    if (busy) return;
    if (onConfirm) {
      // 受控模式:写标志与跳转由调用方处理
      onConfirm(flag);
      return;
    }
    sessionStorage.setItem(flag, '1');
    setOpenState(false);
  };

  const cancel = () => {
    if (busy) return;
    if (controlled) {
      if (onCancel) onCancel();
      return;
    }
    setOpenState(false);
    navigate('/');
  };

  return (
    <Modal
      maskClosable={false}
      open={open}
      title={t('portal.sso.title')}
      onClose={cancel}
      typewriter={false}
      footer={
        <>
          <Button onClick={cancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="primary" loading={busy} disabled={busy} onClick={confirm}>
            {t('portal.sso.confirm')}
          </Button>
        </>
      }
    >
      <div className="sso-body">
        {service ? <p className="muted-text">{t('portal.sso.service', { name: service })}</p> : null}
        <Card pattern={pattern}>
          <div className="sso-identity">
            <Avatar size="large">{(displayName || '?').slice(0, 1)}</Avatar>
            <div>
              <div className="sso-name">{displayName}</div>
              <div className="sso-account">@{user?.username}</div>
            </div>
          </div>
        </Card>
        <p className="muted-text">{tip}</p>
      </div>
    </Modal>
  );
}
