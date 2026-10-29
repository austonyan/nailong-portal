// 奶龙国皇家档案与记录署 — 设置(自动审批)。
import { useTranslation } from 'react-i18next';
import { Card, Title } from 'animal-island-ui';
import AutoApproveSettings from '../../../components/AutoApproveSettings.jsx';
import { ArchAdminNav } from '../shared.jsx';

export default function AdminArchSettings() {
  const { t } = useTranslation();
  return (
    <div className="arch-page">
      <ArchAdminNav />
      <div className="page-header">
        <h1 className="page-title">
          <Title size="middle" color="brown">
            {t('autoApprove.title')}
          </Title>
        </h1>
      </div>
      <Card>
        <AutoApproveSettings service="archives" />
      </Card>
    </div>
  );
}
