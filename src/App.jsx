import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card } from 'animal-island-ui';
import AppLayout from './components/AppLayout.jsx';
import { FullLoading, RequireAuth, RequirePermission } from './auth/guards.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import { useSetup } from './setup/SetupContext.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Setup from './pages/Setup.jsx';
import Portal from './pages/Portal.jsx';
import Profile from './pages/Profile.jsx';
import Certificates from './pages/certificates/Certificates.jsx';
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
import AdminRecognize from './pages/admin/AdminRecognize.jsx';
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
import AdminImSettings from './pages/immigration/admin/AdminImSettings.jsx';
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
// 奶龙国皇家居民登记署
import ResidentShell from './pages/resident/ResidentShell.jsx';
import ResidentHome from './pages/resident/ResidentHome.jsx';
import ResidentGuide from './pages/resident/ResidentGuide.jsx';
import ResidentApply from './pages/resident/ResidentApply.jsx';
import ResidentMyApplications from './pages/resident/ResidentMyApplications.jsx';
import ResidentApplicationDetail from './pages/resident/ResidentApplicationDetail.jsx';
import ResidentCard from './pages/resident/ResidentCard.jsx';
import ResidentChanges from './pages/resident/ResidentChanges.jsx';
import ResidentBenefits from './pages/resident/ResidentBenefits.jsx';
import ResidentMessages from './pages/resident/ResidentMessages.jsx';
import ResidentVerify from './pages/resident/ResidentVerify.jsx';
import AdminResReview from './pages/resident/admin/AdminResReview.jsx';
import AdminResChanges from './pages/resident/admin/AdminResChanges.jsx';
import AdminResCards from './pages/resident/admin/AdminResCards.jsx';
import AdminResResidents from './pages/resident/admin/AdminResResidents.jsx';
import AdminResVerify from './pages/resident/admin/AdminResVerify.jsx';
import AdminResTypes from './pages/resident/admin/AdminResTypes.jsx';
import AdminResNotices from './pages/resident/admin/AdminResNotices.jsx';
import AdminResRisk from './pages/resident/admin/AdminResRisk.jsx';
import AdminResStats from './pages/resident/admin/AdminResStats.jsx';
import AdminResSettings from './pages/resident/admin/AdminResSettings.jsx';
import AdminResAudit from './pages/resident/admin/AdminResAudit.jsx';
// 奶龙国皇家礼宾与活动署
import ProtocolShell from './pages/protocol/ProtocolShell.jsx';
import ProtocolHome from './pages/protocol/ProtocolHome.jsx';
import ProtocolEvents from './pages/protocol/ProtocolEvents.jsx';
import ProtocolEventDetail from './pages/protocol/ProtocolEventDetail.jsx';
import ProtocolApply from './pages/protocol/ProtocolApply.jsx';
import ProtocolMyRegistrations from './pages/protocol/ProtocolMyRegistrations.jsx';
import ProtocolInvitations from './pages/protocol/ProtocolInvitations.jsx';
import ProtocolPasses from './pages/protocol/ProtocolPasses.jsx';
import ProtocolHosts from './pages/protocol/ProtocolHosts.jsx';
import ProtocolCourtesy from './pages/protocol/ProtocolCourtesy.jsx';
import ProtocolMessages from './pages/protocol/ProtocolMessages.jsx';
import ProtocolHelp from './pages/protocol/ProtocolHelp.jsx';
import ProtocolVerify from './pages/protocol/ProtocolVerify.jsx';
import AdminProtocolReview from './pages/protocol/admin/AdminProtocolReview.jsx';
import AdminProtocolEvents from './pages/protocol/admin/AdminProtocolEvents.jsx';
import AdminProtocolIssuance from './pages/protocol/admin/AdminProtocolIssuance.jsx';
import AdminProtocolHosts from './pages/protocol/admin/AdminProtocolHosts.jsx';
import AdminProtocolCourtesy from './pages/protocol/admin/AdminProtocolCourtesy.jsx';
import AdminProtocolCheckin from './pages/protocol/admin/AdminProtocolCheckin.jsx';
import AdminProtocolManage from './pages/protocol/admin/AdminProtocolManage.jsx';
import AdminProtocolStats from './pages/protocol/admin/AdminProtocolStats.jsx';
import AdminProtocolAudit from './pages/protocol/admin/AdminProtocolAudit.jsx';
// 奶龙国皇家申诉与监察署
import AppealShell from './pages/appeal/AppealShell.jsx';
import AppealHome from './pages/appeal/AppealHome.jsx';
import AppealGuide from './pages/appeal/AppealGuide.jsx';
import AppealApply from './pages/appeal/AppealApply.jsx';
import AppealMyAppeals from './pages/appeal/AppealMyAppeals.jsx';
import AppealAppealDetail from './pages/appeal/AppealAppealDetail.jsx';
import AppealReviews from './pages/appeal/AppealReviews.jsx';
import AppealComplaints from './pages/appeal/AppealComplaints.jsx';
import AppealTickets from './pages/appeal/AppealTickets.jsx';
import AppealDecisions from './pages/appeal/AppealDecisions.jsx';
import AppealDecisionDoc from './pages/appeal/AppealDecisionDoc.jsx';
import AppealPublicity from './pages/appeal/AppealPublicity.jsx';
import AppealMessages from './pages/appeal/AppealMessages.jsx';
import AppealVerify from './pages/appeal/AppealVerify.jsx';
import AppealAdminWorkbench from './pages/appeal/AppealAdminWorkbench.jsx';
import AppealAdminReviews from './pages/appeal/AppealAdminReviews.jsx';
import AppealAdminDesk from './pages/appeal/AppealAdminDesk.jsx';
import AppealAdminInspect from './pages/appeal/AppealAdminInspect.jsx';
import AppealAdminManage from './pages/appeal/AppealAdminManage.jsx';
import AppealAdminStats from './pages/appeal/AppealAdminStats.jsx';
import AppealAdminAudit from './pages/appeal/AppealAdminAudit.jsx';
// 奶龙国皇家档案与记录署
import ArchShell from './pages/archives/ArchShell.jsx';
import ArchHome from './pages/archives/ArchHome.jsx';
import ArchRecords from './pages/archives/ArchRecords.jsx';
import ArchRecordDetail from './pages/archives/ArchRecordDetail.jsx';
import ArchRequests from './pages/archives/ArchRequests.jsx';
import ArchRequestDetail from './pages/archives/ArchRequestDetail.jsx';
import ArchMessages from './pages/archives/ArchMessages.jsx';
import ArchHelp from './pages/archives/ArchHelp.jsx';
import AdminArchRules from './pages/archives/admin/AdminArchRules.jsx';
import AdminArchRecords from './pages/archives/admin/AdminArchRecords.jsx';
import AdminArchRequests from './pages/archives/admin/AdminArchRequests.jsx';
import AdminArchAccess from './pages/archives/admin/AdminArchAccess.jsx';
import AdminArchAudit from './pages/archives/admin/AdminArchAudit.jsx';
import AdminArchSettings from './pages/archives/admin/AdminArchSettings.jsx';
// 奶龙国皇家邮政与通信署
import PostalShell from './pages/postal/PostalShell.jsx';
import PostalHome from './pages/postal/PostalHome.jsx';
import PostalNotices from './pages/postal/PostalNotices.jsx';
import PostalMessages from './pages/postal/PostalMessages.jsx';
import PostalPostcards from './pages/postal/PostalPostcards.jsx';
import PostalCompose from './pages/postal/PostalCompose.jsx';
import PostalSubscription from './pages/postal/PostalSubscription.jsx';
import AdminPostNotices from './pages/postal/admin/AdminPostNotices.jsx';
import AdminPostTemplates from './pages/postal/admin/AdminPostTemplates.jsx';
import AdminPostCardTemplates from './pages/postal/admin/AdminPostCardTemplates.jsx';
import AdminPostCards from './pages/postal/admin/AdminPostCards.jsx';
import AdminPostStats from './pages/postal/admin/AdminPostStats.jsx';
import AdminPostAudit from './pages/postal/admin/AdminPostAudit.jsx';
// 奶龙国皇家文化旅游署
import TourismShell from './pages/tourism/TourismShell.jsx';
import TourismHome from './pages/tourism/TourismHome.jsx';
import TourismAttractions from './pages/tourism/TourismAttractions.jsx';
import TourismAttractionDetail from './pages/tourism/TourismAttractionDetail.jsx';
import TourismArticles from './pages/tourism/TourismArticles.jsx';
import TourismArticleDetail from './pages/tourism/TourismArticleDetail.jsx';
import TourismCollection from './pages/tourism/TourismCollection.jsx';
import TourismBadges from './pages/tourism/TourismBadges.jsx';
import TourismMy from './pages/tourism/TourismMy.jsx';
import AdminTourAttractions from './pages/tourism/admin/AdminTourAttractions.jsx';
import AdminTourArticles from './pages/tourism/admin/AdminTourArticles.jsx';
import AdminTourRules from './pages/tourism/admin/AdminTourRules.jsx';
import AdminTourBadges from './pages/tourism/admin/AdminTourBadges.jsx';
import AdminTourStats from './pages/tourism/admin/AdminTourStats.jsx';
import AdminTourAudit from './pages/tourism/admin/AdminTourAudit.jsx';
// 奶龙国皇家统计署
import StatsShell from './pages/stats/StatsShell.jsx';
import StatsHome from './pages/stats/StatsHome.jsx';
import StatsReports from './pages/stats/StatsReports.jsx';
import StatsReportDetail from './pages/stats/StatsReportDetail.jsx';
import StatsGuide from './pages/stats/StatsGuide.jsx';
import AdminStatDashboard from './pages/stats/admin/AdminStatDashboard.jsx';
import AdminStatMetrics from './pages/stats/admin/AdminStatMetrics.jsx';
import AdminStatExport from './pages/stats/admin/AdminStatExport.jsx';
import AdminStatAudit from './pages/stats/admin/AdminStatAudit.jsx';
// 奶龙国皇家教育与科学署
import EduShell from './pages/education/EduShell.jsx';
import EduHome from './pages/education/EduHome.jsx';
import EduEntries from './pages/education/EduEntries.jsx';
import EduEntryDetail from './pages/education/EduEntryDetail.jsx';
import EduArticles from './pages/education/EduArticles.jsx';
import EduArticleDetail from './pages/education/EduArticleDetail.jsx';
import EduTasks from './pages/education/EduTasks.jsx';
import EduMy from './pages/education/EduMy.jsx';
import AdminEduReview from './pages/education/admin/AdminEduReview.jsx';
import AdminEduEntries from './pages/education/admin/AdminEduEntries.jsx';
import AdminEduArticles from './pages/education/admin/AdminEduArticles.jsx';
import AdminEduTasks from './pages/education/admin/AdminEduTasks.jsx';
import AdminEduStats from './pages/education/admin/AdminEduStats.jsx';
import AdminEduAudit from './pages/education/admin/AdminEduAudit.jsx';
import AdminEduSettings from './pages/education/admin/AdminEduSettings.jsx';

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

// Global first-run gate: until the initial admin exists, every route is
// redirected to /setup. Once the setup latch is set, /setup itself becomes
// unreachable and falls back to the portal (or login).
function SetupGate({ children }) {
  const { t } = useTranslation();
  const { required, loading } = useSetup();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  if (loading || authLoading) return <FullLoading tip={t('setup.checking')} />;
  if (required && location.pathname !== '/setup') return <Navigate to="/setup" replace />;
  if (!required && location.pathname === '/setup') return <Navigate to={user ? '/' : '/login'} replace />;
  return children;
}

export default function App() {
  return (
    <SetupGate>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      {/* 验真中心:公开页,不需要登录 */}
      <Route path="/visa/verify" element={<VisaVerify />} />
      {/* 皇家口岸入境署验真页(二维码 token,公开) */}
      <Route path="/immigration/verify" element={<ImmigrationVerify />} />
      {/* 外交署验真中心(编号/token,公开) */}
      <Route path="/dip/verify" element={<DipVerify />} />
      <Route path="/dip-verify" element={<DipVerify />} />
      {/* 皇家居民登记署验真页(公开) */}
      <Route path="/resident/verify" element={<ResidentVerify />} />
      {/* 礼宾与活动署验真中心(公开) */}
      <Route path="/protocol/verify" element={<ProtocolVerify />} />
      {/* 皇家申诉与监察署验真中心(公开) */}
      <Route path="/appeal/verify" element={<AppealVerify />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Portal />} />
        <Route path="/profile" element={<Profile />} />
        {/* 统一证件库:跨署查看本人有效证件与到期提醒 */} 
        <Route path="/certificates" element={<Certificates />} />
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
        <Route
          path="/admin/recognize"
          element={
            <RequirePermission permission="services:read">
              <AdminRecognize />
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
          path="/admin/immigration/settings"
          element={
            <RequirePermission permission="imm:admin">
              <AdminImSettings />
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
        {/* 奶龙国皇家居民登记署(用户端) */}
        <Route
          path="/resident"
          element={
            <ResidentShell>
              <ResidentHome />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/guide"
          element={
            <ResidentShell>
              <ResidentGuide />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/apply"
          element={
            <ResidentShell>
              <ResidentApply />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/apply/:typeCode"
          element={
            <ResidentShell>
              <ResidentApply />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/applications"
          element={
            <ResidentShell>
              <ResidentMyApplications />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/applications/:id"
          element={
            <ResidentShell>
              <ResidentApplicationDetail />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/applications/:id/edit"
          element={
            <ResidentShell>
              <ResidentApply />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/card"
          element={
            <ResidentShell>
              <ResidentCard />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/changes"
          element={
            <ResidentShell>
              <ResidentChanges />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/benefits"
          element={
            <ResidentShell>
              <ResidentBenefits />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/messages"
          element={
            <ResidentShell>
              <ResidentMessages />
            </ResidentShell>
          }
        />
        {/* 奶龙国皇家居民登记署(管理端) */}
        <Route
          path="/resident/admin/review"
          element={
            <ResidentShell permission="res:review">
              <AdminResReview />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/changes"
          element={
            <ResidentShell permission="res:review">
              <AdminResChanges />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/cards"
          element={
            <ResidentShell permission="res:review">
              <AdminResCards />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/residents"
          element={
            <ResidentShell permission="res:review">
              <AdminResResidents />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/verify"
          element={
            <ResidentShell permission="res:manage">
              <AdminResVerify />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/types"
          element={
            <ResidentShell permission="res:manage">
              <AdminResTypes />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/notices"
          element={
            <ResidentShell permission="res:manage">
              <AdminResNotices />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/risk"
          element={
            <ResidentShell permission="res:manage">
              <AdminResRisk />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/stats"
          element={
            <ResidentShell permission="res:manage">
              <AdminResStats />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/settings"
          element={
            <ResidentShell permission="res:manage">
              <AdminResSettings />
            </ResidentShell>
          }
        />
        <Route
          path="/resident/admin/audit"
          element={
            <ResidentShell permission="res:manage">
              <AdminResAudit />
            </ResidentShell>
          }
        />
        {/* 奶龙国皇家礼宾与活动署:前台 */}
        <Route path="/protocol" element={<ProtocolShell><ProtocolHome /></ProtocolShell>} />
        <Route path="/protocol/events" element={<ProtocolShell><ProtocolEvents /></ProtocolShell>} />
        <Route path="/protocol/events/:no" element={<ProtocolShell><ProtocolEventDetail /></ProtocolShell>} />
        <Route path="/protocol/events/:no/apply" element={<ProtocolShell><ProtocolApply /></ProtocolShell>} />
        <Route path="/protocol/registrations" element={<ProtocolShell><ProtocolMyRegistrations /></ProtocolShell>} />
        <Route path="/protocol/registrations/:id" element={<ProtocolShell><ProtocolMyRegistrations /></ProtocolShell>} />
        <Route path="/protocol/registrations/:id/edit" element={<ProtocolShell><ProtocolApply /></ProtocolShell>} />
        <Route path="/protocol/invitations" element={<ProtocolShell><ProtocolInvitations /></ProtocolShell>} />
        <Route path="/protocol/passes" element={<ProtocolShell><ProtocolPasses /></ProtocolShell>} />
        <Route path="/protocol/hosts" element={<ProtocolShell><ProtocolHosts /></ProtocolShell>} />
        <Route path="/protocol/courtesy" element={<ProtocolShell><ProtocolCourtesy /></ProtocolShell>} />
        <Route path="/protocol/messages" element={<ProtocolShell><ProtocolMessages /></ProtocolShell>} />
        <Route path="/protocol/help" element={<ProtocolShell><ProtocolHelp /></ProtocolShell>} />
        <Route path="/protocol/admin/review" element={<ProtocolShell variant="admin" permission="evt:review"><AdminProtocolReview /></ProtocolShell>} />
        <Route path="/protocol/admin/events" element={<ProtocolShell variant="admin" permission="evt:manage"><AdminProtocolEvents /></ProtocolShell>} />
        <Route path="/protocol/admin/issuance" element={<ProtocolShell variant="admin" permission="evt:manage"><AdminProtocolIssuance /></ProtocolShell>} />
        <Route path="/protocol/admin/hosts" element={<ProtocolShell variant="admin" permission="evt:review"><AdminProtocolHosts /></ProtocolShell>} />
        <Route path="/protocol/admin/courtesy" element={<ProtocolShell variant="admin" permission="evt:review"><AdminProtocolCourtesy /></ProtocolShell>} />
        <Route path="/protocol/admin/checkin" element={<ProtocolShell variant="admin" permission="evt:checkin"><AdminProtocolCheckin /></ProtocolShell>} />
        <Route path="/protocol/admin/manage" element={<ProtocolShell variant="admin" permission="evt:manage"><AdminProtocolManage /></ProtocolShell>} />
        <Route path="/protocol/admin/stats" element={<ProtocolShell variant="admin" permission="evt:manage"><AdminProtocolStats /></ProtocolShell>} />
        <Route path="/protocol/admin/audit" element={<ProtocolShell variant="admin" permission="evt:manage"><AdminProtocolAudit /></ProtocolShell>} />
        {/* 奶龙国皇家申诉与监察署:前台 */}
        <Route path="/appeal" element={<AppealShell><AppealHome /></AppealShell>} />
        <Route path="/appeal/guide" element={<AppealShell><AppealGuide /></AppealShell>} />
        <Route path="/appeal/apply" element={<AppealShell><AppealApply /></AppealShell>} />
        <Route path="/appeal/apply/:id" element={<AppealShell><AppealApply /></AppealShell>} />
        <Route path="/appeal/my" element={<AppealShell><AppealMyAppeals /></AppealShell>} />
        <Route path="/appeal/appeals/:id" element={<AppealShell><AppealAppealDetail /></AppealShell>} />
        <Route path="/appeal/reviews" element={<AppealShell><AppealReviews /></AppealShell>} />
        <Route path="/appeal/complaints" element={<AppealShell><AppealComplaints /></AppealShell>} />
        <Route path="/appeal/tickets" element={<AppealShell><AppealTickets /></AppealShell>} />
        <Route path="/appeal/decisions" element={<AppealShell><AppealDecisions /></AppealShell>} />
        <Route path="/appeal/decisions/:code" element={<AppealShell><AppealDecisionDoc /></AppealShell>} />
        <Route path="/appeal/publicity" element={<AppealShell><AppealPublicity /></AppealShell>} />
        <Route path="/appeal/messages" element={<AppealShell><AppealMessages /></AppealShell>} />
        {/* 奶龙国皇家申诉与监察署:管理端(队列隔离) */}
        <Route path="/appeal/admin/workbench" element={<AppealShell permission="appeal:process"><AppealAdminWorkbench /></AppealShell>} />
        <Route path="/appeal/admin/reviews" element={<AppealShell permission="appeal:review"><AppealAdminReviews /></AppealShell>} />
        <Route path="/appeal/admin/desk" element={<AppealShell permission="appeal:process"><AppealAdminDesk /></AppealShell>} />
        <Route path="/appeal/admin/inspect" element={<AppealShell permission="appeal:inspect"><AppealAdminInspect /></AppealShell>} />
        <Route path="/appeal/admin/manage" element={<AppealShell permission="appeal:manage"><AppealAdminManage /></AppealShell>} />
        <Route path="/appeal/admin/stats" element={<AppealShell permission="appeal:manage"><AppealAdminStats /></AppealShell>} />
        <Route path="/appeal/admin/audit" element={<AppealShell permission="appeal:manage"><AppealAdminAudit /></AppealShell>} />
        {/* 奶龙国皇家档案与记录署:前台 */}
        <Route path="/archives" element={<ArchShell><ArchHome /></ArchShell>} />
        <Route path="/archives/records" element={<ArchShell><ArchRecords /></ArchShell>} />
        <Route path="/archives/records/:type/:id" element={<ArchShell><ArchRecordDetail /></ArchShell>} />
        <Route path="/archives/requests" element={<ArchShell><ArchRequests /></ArchShell>} />
        <Route path="/archives/requests/:id" element={<ArchShell><ArchRequestDetail /></ArchShell>} />
        <Route path="/archives/messages" element={<ArchShell><ArchMessages /></ArchShell>} />
        <Route path="/archives/help" element={<ArchShell><ArchHelp /></ArchShell>} />
        {/* 奶龙国皇家档案与记录署:管理端(arch:manage) */}
        <Route path="/archives/admin/rules" element={<ArchShell permission="arch:manage" admin><AdminArchRules /></ArchShell>} />
        <Route path="/archives/admin/records" element={<ArchShell permission="arch:manage" admin><AdminArchRecords /></ArchShell>} />
        <Route path="/archives/admin/requests" element={<ArchShell permission="arch:manage" admin><AdminArchRequests /></ArchShell>} />
        <Route path="/archives/admin/access" element={<ArchShell permission="arch:manage" admin><AdminArchAccess /></ArchShell>} />
        <Route path="/archives/admin/audit" element={<ArchShell permission="arch:manage" admin><AdminArchAudit /></ArchShell>} />
        <Route path="/archives/admin/settings" element={<ArchShell permission="arch:manage" admin><AdminArchSettings /></ArchShell>} />
        {/* 奶龙国皇家邮政与通信署：前台（SSO 确认在 PostalShell 内，直连 URL 同样强制） */}
        <Route path="/postal" element={<PostalShell><PostalHome /></PostalShell>} />
        <Route path="/postal/notices" element={<PostalShell><PostalNotices /></PostalShell>} />
        <Route path="/postal/notices/:id" element={<PostalShell><PostalNotices /></PostalShell>} />
        <Route path="/postal/messages" element={<PostalShell><PostalMessages /></PostalShell>} />
        <Route path="/postal/postcards" element={<PostalShell><PostalPostcards /></PostalShell>} />
        <Route path="/postal/postcards/new" element={<PostalShell><PostalCompose /></PostalShell>} />
        <Route path="/postal/subscription" element={<PostalShell><PostalSubscription /></PostalShell>} />
        {/* 奶龙国皇家邮政与通信署：管理端 */}
        <Route path="/postal/admin/notices" element={<PostalShell permission="post:manage"><AdminPostNotices /></PostalShell>} />
        <Route path="/postal/admin/templates" element={<PostalShell permission="post:manage"><AdminPostTemplates /></PostalShell>} />
        <Route path="/postal/admin/card-templates" element={<PostalShell permission="post:manage"><AdminPostCardTemplates /></PostalShell>} />
        <Route path="/postal/admin/postcards" element={<PostalShell permission="post:manage"><AdminPostCards /></PostalShell>} />
        <Route path="/postal/admin/stats" element={<PostalShell permission="post:manage"><AdminPostStats /></PostalShell>} />
        <Route path="/postal/admin/audit" element={<PostalShell permission="post:manage"><AdminPostAudit /></PostalShell>} />
        {/* 奶龙国皇家文化旅游署:前台 */}
        <Route path="/tourism" element={<TourismShell><TourismHome /></TourismShell>} />
        <Route path="/tourism/attractions" element={<TourismShell><TourismAttractions /></TourismShell>} />
        <Route path="/tourism/attractions/:id" element={<TourismShell><TourismAttractionDetail /></TourismShell>} />
        <Route path="/tourism/articles" element={<TourismShell><TourismArticles /></TourismShell>} />
        <Route path="/tourism/articles/:id" element={<TourismShell><TourismArticleDetail /></TourismShell>} />
        <Route path="/tourism/collection" element={<TourismShell><TourismCollection /></TourismShell>} />
        <Route path="/tourism/badges" element={<TourismShell><TourismBadges /></TourismShell>} />
        <Route path="/tourism/my" element={<TourismShell><TourismMy /></TourismShell>} />
        {/* 奶龙国皇家文化旅游署:管理端 */}
        <Route path="/tourism/admin/attractions" element={<TourismShell permission="tour:manage"><AdminTourAttractions /></TourismShell>} />
        <Route path="/tourism/admin/articles" element={<TourismShell permission="tour:manage"><AdminTourArticles /></TourismShell>} />
        <Route path="/tourism/admin/rules" element={<TourismShell permission="tour:manage"><AdminTourRules /></TourismShell>} />
        <Route path="/tourism/admin/badges" element={<TourismShell permission="tour:manage"><AdminTourBadges /></TourismShell>} />
        <Route path="/tourism/admin/stats" element={<TourismShell permission="tour:manage"><AdminTourStats /></TourismShell>} />
        <Route path="/tourism/admin/audit" element={<TourismShell permission="tour:manage"><AdminTourAudit /></TourismShell>} />
        {/* 奶龙国皇家统计署:前台 */}
        <Route path="/stats" element={<StatsShell><StatsHome /></StatsShell>} />
        <Route path="/stats/reports" element={<StatsShell><StatsReports /></StatsShell>} />
        <Route path="/stats/reports/:id" element={<StatsShell><StatsReportDetail /></StatsShell>} />
        <Route path="/stats/guide" element={<StatsShell><StatsGuide /></StatsShell>} />
        {/* 奶龙国皇家统计署:管理端(stat:manage) */}
        <Route path="/stats/admin/dashboard" element={<StatsShell permission="stat:manage"><AdminStatDashboard /></StatsShell>} />
        <Route path="/stats/admin/metrics" element={<StatsShell permission="stat:manage"><AdminStatMetrics /></StatsShell>} />
        <Route path="/stats/admin/export" element={<StatsShell permission="stat:manage"><AdminStatExport /></StatsShell>} />
        <Route path="/stats/admin/audit" element={<StatsShell permission="stat:manage"><AdminStatAudit /></StatsShell>} />
        {/* 奶龙国皇家教育与科学署:前台 */}
        <Route path="/education" element={<EduShell><EduHome /></EduShell>} />
        <Route path="/education/entries" element={<EduShell><EduEntries /></EduShell>} />
        <Route path="/education/entries/:id" element={<EduShell><EduEntryDetail /></EduShell>} />
        <Route path="/education/articles" element={<EduShell><EduArticles /></EduShell>} />
        <Route path="/education/articles/:id" element={<EduShell><EduArticleDetail /></EduShell>} />
        <Route path="/education/tasks" element={<EduShell><EduTasks /></EduShell>} />
        <Route path="/education/my" element={<EduShell><EduMy /></EduShell>} />
        {/* 奶龙国皇家教育与科学署:管理端(review 与 manage 分权) */}
        <Route path="/education/admin/review" element={<EduShell permission="edu:review"><AdminEduReview /></EduShell>} />
        <Route path="/education/admin/entries" element={<EduShell permission="edu:manage"><AdminEduEntries /></EduShell>} />
        <Route path="/education/admin/articles" element={<EduShell permission="edu:manage"><AdminEduArticles /></EduShell>} />
        <Route path="/education/admin/tasks" element={<EduShell permission="edu:manage"><AdminEduTasks /></EduShell>} />
        <Route path="/education/admin/stats" element={<EduShell permission="edu:manage"><AdminEduStats /></EduShell>} />
        <Route path="/education/admin/audit" element={<EduShell permission="edu:manage"><AdminEduAudit /></EduShell>} />
        <Route path="/education/admin/settings" element={<EduShell permission="edu:manage"><AdminEduSettings /></EduShell>} />
      </Route>
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </SetupGate>
  );
}
