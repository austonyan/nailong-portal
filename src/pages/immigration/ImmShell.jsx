// 皇家口岸入境署 shell: 直连 URL 也要先过统一门户的单点登录身份确认(每个
// 浏览器会话一次),与门户服务卡入口写同一个 sessionStorage 标志,确认过不重复弹。
// 入境署各页面自带署内导航,这里不渲染横幅/页签,只补齐与其他署 Shell 相同的那道门。
import { useTranslation } from 'react-i18next';
import SsoConfirmModal from '../../components/SsoConfirmModal.jsx';

export default function ImmShell({ children }) {
  const { t } = useTranslation();
  return (
    <>
      {children}
      <SsoConfirmModal flag="nailong.immigration.sso" tip={t('imm.sso.tip')} pattern="app-teal" />
    </>
  );
}
