// 奶龙国皇家教育与科学署 — 设置(自动审批)。
import { useTranslation } from 'react-i18next';
import { Card, Title } from 'animal-island-ui';
import AutoApproveSettings from '../../../components/AutoApproveSettings.jsx';

export default function AdminEduSettings() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="app-blue">
            {t('autoApprove.title')}
          </Title>
        </h1>
      </div>
      <Card>
        <AutoApproveSettings service="education" />
      </Card>
    </div>
  );
}
