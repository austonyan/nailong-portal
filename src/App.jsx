import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card } from 'animal-island-ui';
import AppLayout from './components/AppLayout.jsx';
import { RequireAuth, RequirePermission } from './auth/guards.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Portal from './pages/Portal.jsx';
import Profile from './pages/Profile.jsx';
import VisaShell from './pages/visa/VisaShell.jsx';
import VisaHome from './pages/visa/VisaHome.jsx';
import VisaApplyGuide from './pages/visa/VisaApplyGuide.jsx';
import VisaApplyForm from './pages/visa/VisaApplyForm.jsx';
import VisaMyApplications from './pages/visa/VisaMyApplications.jsx';
import VisaApplicationDetail from './pages/visa/VisaApplicationDetail.jsx';
import VisaPermits from './pages/visa/VisaPermits.jsx';
import VisaVerify from './pages/visa/VisaVerify.jsx';
import VisaMessages from './pages/visa/VisaMessages.jsx';
import VisaAdminWorkbench from './pages/visa/VisaAdminWorkbench.jsx';
import VisaAdminManage from './pages/visa/VisaAdminManage.jsx';
import VisaAdminStats from './pages/visa/VisaAdminStats.jsx';
import VisaAdminAudit from './pages/visa/VisaAdminAudit.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminRoles from './pages/admin/AdminRoles.jsx';
import AdminServices from './pages/admin/AdminServices.jsx';
import DocsLayout from './pages/docs/DocsLayout.jsx';
import DocsHome from './pages/docs/DocsHome.jsx';
import DocsTypes from './pages/docs/DocsTypes.jsx';
import DocsApply from './pages/docs/DocsApply.jsx';
import DocsApplications from './pages/docs/DocsApplications.jsx';
import DocsApplicationDetail from './pages/docs/DocsApplicationDetail.jsx';
import DocsCertificates from './pages/docs/DocsCertificates.jsx';
import DocsCertificateDetail from './pages/docs/DocsCertificateDetail.jsx';
import DocsVerify from './pages/docs/DocsVerify.jsx';
import DocsMessages from './pages/docs/DocsMessages.jsx';
import DocsAdminLayout from './pages/admin/docs/DocsAdminLayout.jsx';
import DocsReview from './pages/admin/docs/DocsReview.jsx';
import DocsTypesAdmin from './pages/admin/docs/DocsTypesAdmin.jsx';
import DocsCertsAdmin from './pages/admin/docs/DocsCertsAdmin.jsx';
import DocsVerifyAdmin from './pages/admin/docs/DocsVerifyAdmin.jsx';
import DocsStats from './pages/admin/docs/DocsStats.jsx';
import DocsNotices from './pages/admin/docs/DocsNotices.jsx';
import DocsAudit from './pages/admin/docs/DocsAudit.jsx';
import DocsSettings from './pages/admin/docs/DocsSettings.jsx';
import ImmigrationHome from './pages/immigration/ImmigrationHome.jsx';
import ImmigrationPorts from './pages/immigration/ImmigrationPorts.jsx';
import ImmigrationPortDetail from './pages/immigration/ImmigrationPortDetail.jsx';
import DeclarationEdit from './pages/immigration/DeclarationEdit.jsx';
import MyDeclarations from './pages/immigration/MyDeclarations.jsx';
import PassCodes from './pages/immigration/PassCodes.jsx';
import ImmigrationRecords from './pages/immigration/ImmigrationRecords.jsx';
import ImmigrationMessages from './pages/immigration/ImmigrationMessages.jsx';
import ImmigrationHelp from './pages/immigration/ImmigrationHelp.jsx';
import ImmigrationVerify from './pages/immigration/ImmigrationVerify.jsx';
import AdminImPorts from './pages/immigration/admin/AdminImPorts.jsx';
import AdminImReview from './pages/immigration/admin/AdminImReview.jsx';
import AdminImVerify from './pages/immigration/admin/AdminImVerify.jsx';
import AdminImRecords from './pages/immigration/admin/AdminImRecords.jsx';
import AdminImStats from './pages/immigration/admin/AdminImStats.jsx';
import AdminImAudit from './pages/immigration/admin/AdminImAudit.jsx';
// 奶龙国皇家外交事务署
import DipShell from './pages/dip/DipShell.jsx';
import DipHome from './pages/dip/DipHome.jsx';
import DipApply from './pages/dip/DipApply.jsx';
import DipRelations from './pages/dip/DipRelations.jsx';
import DipIdentity from './pages/dip/DipIdentity.jsx';
import DipAgreements from './pages/dip/DipAgreements.jsx';
import DipCourtesies from './pages/dip/DipCourtesies.jsx';
import DipOffices from './pages/dip/DipOffices.jsx';
import DipMessages from './pages/dip/DipMessages.jsx';
import DipVerify from './pages/dip/DipVerify.jsx';
import AdminDipReview from './pages/dip/admin/AdminDipReview.jsx';
import AdminDipAgreements from './pages/dip/admin/AdminDipAgreements.jsx';
import AdminDipOffices from './pages/dip/admin/AdminDipOffices.jsx';
import AdminDipVerify from './pages/dip/admin/AdminDipVerify.jsx';
import AdminDipConfig from './pages/dip/admin/AdminDipConfig.jsx';
import AdminDipStats from './pages/dip/admin/AdminDipStats.jsx';
import AdminDipAudit from './pages/dip/admin/AdminDipAudit.jsx';

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="center-screen">
      <Card>
        <h2>{t('errors.notFoundTitle')}</h2>
        <p className="muted-text">{t('errors.notFoundTip')}</p>
        <Button type="primary" onClick={() => window.location.assign('/')}>
          {t('errors.backHome')}
        </Button>
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* 验真中心:公开页,不需要登录 */}
      <Route path="/visa/verify" element={<VisaVerify />} />
      {/* 皇家口岸入境署验真页(二维码 token,公开) */}
      <Route path="/immigration/verify" element={<ImmigrationVerify />} />
      {/* 外交署验真中心(编号/token,公开) */}
      <Route path="/dip/verify" element={<DipVerify />} />
      <Route path="/dip-verify" element={<DipVerify />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Portal />} />
        <Route path="/profile" element={<Profile />} />
        {/* 奶龍國簽註申請署 */}
        <Route
          path="/visa"
          element={
            <VisaShell>
              <VisaHome />
            </VisaShell>
          }
        />
        <Route
          path="/visa/apply"
          element={
            <VisaShell>
              <VisaApplyGuide />
            </VisaShell>
          }
        />
        <Route
          path="/visa/apply/:typeCode"
          element={
            <VisaShell>
              <VisaApplyGuide />
            </VisaShell>
          }
        />
        <Route
          path="/visa/apply/:typeCode/form"
          element={
            <VisaShell>
              <VisaApplyForm />
            </VisaShell>
          }
        />
        <Route
          path="/visa/applications"
          element={
            <VisaShell>
              <VisaMyApplications />
            </VisaShell>
          }
        />
        <Route
          path="/visa/applications/:id"
          element={
            <VisaShell>
              <VisaApplicationDetail />
            </VisaShell>
          }
        />
        <Route
          path="/visa/applications/:id/edit"
          element={
            <VisaShell>
              <VisaApplyForm />
            </VisaShell>
          }
        />
        <Route
          path="/visa/permits"
          element={
            <VisaShell>
              <VisaPermits />
            </VisaShell>
          }
        />
        <Route
          path="/visa/messages"
          element={
            <VisaShell>
              <VisaMessages />
            </VisaShell>
          }
        />
        <Route
          path="/visa/admin/workbench"
          element={
            <VisaShell permission="visa:review">
              <VisaAdminWorkbench />
            </VisaShell>
          }
        />
        <Route
          path="/visa/admin/manage"
          element={
            <VisaShell permission="visa:manage">
              <VisaAdminManage />
            </VisaShell>
          }
        />
        <Route
          path="/visa/admin/stats"
          element={
            <VisaShell permission="visa:manage">
              <VisaAdminStats />
            </VisaShell>
          }
        />
        <Route
          path="/visa/admin/audit"
          element={
            <VisaShell permission="visa:manage">
              <VisaAdminAudit />
            </VisaShell>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequirePermission permission="users:read">
              <AdminUsers />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/roles"
          element={
            <RequirePermission permission="roles:read">
              <AdminRoles />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/services"
          element={
            <RequirePermission permission="services:read">
              <AdminServices />
            </RequirePermission>
          }
        />
        {/* 奶龍國皇家文書與認證署 */}
        <Route
          path="/docs"
          element={
            <RequirePermission permission="docs:apply">
              <DocsLayout />
            </RequirePermission>
          }
        >
          <Route index element={<DocsHome />} />
          <Route path="types" element={<DocsTypes />} />
          <Route path="apply" element={<DocsApply />} />
          <Route path="applications" element={<DocsApplications />} />
          <Route path="applications/:id" element={<DocsApplicationDetail />} />
          <Route path="certificates" element={<DocsCertificates />} />
          <Route path="certificates/:id" element={<DocsCertificateDetail />} />
          <Route path="verify" element={<DocsVerify />} />
          <Route path="messages" element={<DocsMessages />} />
        </Route>
        <Route
          path="/admin/docs/review"
          element={
            <RequirePermission permission="docs:certify">
              <DocsAdminLayout />
            </RequirePermission>
          }
        >
          <Route index element={<DocsReview />} />
        </Route>
        <Route
          path="/admin/docs"
          element={
            <RequirePermission permission="docs:manage">
              <DocsAdminLayout />
            </RequirePermission>
          }
        >
          <Route path="types" element={<DocsTypesAdmin />} />
          <Route path="certs" element={<DocsCertsAdmin />} />
          <Route path="verify" element={<DocsVerifyAdmin />} />
          <Route path="stats" element={<DocsStats />} />
          <Route path="notices" element={<DocsNotices />} />
          <Route path="audit" element={<DocsAudit />} />
          <Route path="settings" element={<DocsSettings />} />
        </Route>
        {/* 皇家口岸入境署(用户端) */}
        <Route
          path="/immigration"
          element={
            <RequirePermission permission="imm:portal">
              <ImmigrationHome />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/ports"
          element={
            <RequirePermission permission="imm:portal">
              <ImmigrationPorts />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/ports/:code"
          element={
            <RequirePermission permission="imm:portal">
              <ImmigrationPortDetail />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/declare"
          element={
            <RequirePermission permission="imm:portal">
              <DeclarationEdit />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/declare/:id"
          element={
            <RequirePermission permission="imm:portal">
              <DeclarationEdit />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/declarations"
          element={
            <RequirePermission permission="imm:portal">
              <MyDeclarations />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/pass-codes"
          element={
            <RequirePermission permission="imm:portal">
              <PassCodes />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/records"
          element={
            <RequirePermission permission="imm:portal">
              <ImmigrationRecords />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/messages"
          element={
            <RequirePermission permission="imm:portal">
              <ImmigrationMessages />
            </RequirePermission>
          }
        />
        <Route
          path="/immigration/help"
          element={
            <RequirePermission permission="imm:portal">
              <ImmigrationHelp />
            </RequirePermission>
          }
        />
        {/* 皇家口岸入境署(管理端) */}
        <Route
          path="/admin/immigration/ports"
          element={
            <RequirePermission permission="imm:admin">
              <AdminImPorts />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/immigration/review"
          element={
            <RequirePermission permission="imm:inspect">
              <AdminImReview />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/immigration/verify"
          element={
            <RequirePermission permission="imm:verify">
              <AdminImVerify />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/immigration/records"
          element={
            <RequirePermission permission="imm:admin">
              <AdminImRecords />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/immigration/stats"
          element={
            <RequirePermission permission="imm:admin">
              <AdminImStats />
            </RequirePermission>
          }
        />
        <Route
          path="/admin/immigration/audit"
          element={
            <RequirePermission permission="imm:admin">
              <AdminImAudit />
            </RequirePermission>
          }
        />
        {/* 奶龙国皇家外交事务署(用户端) */}
        <Route
          path="/dip"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipHome />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/apply"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipApply />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/apply/:id"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipApply />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/relations"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipRelations />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/identity"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipIdentity />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/identity/:id"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipIdentity />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/agreements"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipAgreements />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/courtesies"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipCourtesies />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/offices"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipOffices />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/dip/messages"
          element={
            <RequirePermission permission="dip:portal">
              <DipShell>
                <DipMessages />
              </DipShell>
            </RequirePermission>
          }
        />
        {/* 奶龙国皇家外交事务署(管理端) */}
        <Route
          path="/admin/dip/review"
          element={
            <RequirePermission permission="dip:review">
              <DipShell permission="dip:review">
                <AdminDipReview />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/admin/dip/agreements"
          element={
            <RequirePermission permission="dip:admin">
              <DipShell permission="dip:admin">
                <AdminDipAgreements />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/admin/dip/offices"
          element={
            <RequirePermission permission="dip:admin">
              <DipShell permission="dip:admin">
                <AdminDipOffices />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/admin/dip/verify"
          element={
            <RequirePermission permission="dip:admin">
              <DipShell permission="dip:admin">
                <AdminDipVerify />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/admin/dip/config"
          element={
            <RequirePermission permission="dip:admin">
              <DipShell permission="dip:admin">
                <AdminDipConfig />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/admin/dip/stats"
          element={
            <RequirePermission permission="dip:admin">
              <DipShell permission="dip:admin">
                <AdminDipStats />
              </DipShell>
            </RequirePermission>
          }
        />
        <Route
          path="/admin/dip/audit"
          element={
            <RequirePermission permission="dip:admin">
              <DipShell permission="dip:admin">
                <AdminDipAudit />
              </DipShell>
            </RequirePermission>
          }
        />
      </Route>
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
