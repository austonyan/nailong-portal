// 皇家口岸入境署 — 设置(自动审批)。
import { useTranslation } from 'react-i18next';
import { Card, Title } from 'animal-island-ui';
import AutoApproveSettings from '../../../components/AutoApproveSettings.jsx';
import { ImAdminNav } from '../../../components/immigration/shared.jsx';

export default function AdminImSettings() {
  const { t } = useTranslation();
  return (
    <div className="im-page">
      <ImAdminNav />
      <div className="page-header">
        <Title size="middle" color="app-teal">
          {t('autoApprove.title')}
        </Title>
      </div>
      <Card>
        <AutoApproveSettings service="immigration" />
      </Card>
    </div>
  );
}