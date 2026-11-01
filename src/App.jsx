import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card } from 'animal-island-ui';
import AppLayout from './components/AppLayout.jsx';
import { FullLoading, RequireAuth, RequirePermission } from './auth/guards.jsx';
import { useAuth } from './auth/AuthContext.jsx';
import { useSetup } from './setup/SetupContext.jsx';
// 首屏必需页面（登录/注册/首次部署向导/门户首页）：保持静态导入，首屏不额外发请求
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Setup from './pages/Setup.jsx';
import Portal from './pages/Portal.jsx';

// 其余页面按路由懒加载：这些文件全部是 `export default`，直接取默认导出；
// 进入某个署只下载该署的 chunk，其余 11 个署的代码不再进入首屏包。
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Certificates = lazy(() => import('./pages/certificates/Certificates.jsx'));
const VisaShell = lazy(() => import('./pages/visa/VisaShell.jsx'));
const VisaHome = lazy(() => import('./pages/visa/VisaHome.jsx'));
const VisaApplyGuide = lazy(() => import('./pages/visa/VisaApplyGuide.jsx'));
const VisaApplyForm = lazy(() => import('./pages/visa/VisaApplyForm.jsx'));
const VisaMyApplications = lazy(() => import('./pages/visa/VisaMyApplications.jsx'));
const VisaApplicationDetail = lazy(() => import('./pages/visa/VisaApplicationDetail.jsx'));
const VisaPermits = lazy(() => import('./pages/visa/VisaPermits.jsx'));
const VisaVerify = lazy(() => import('./pages/visa/VisaVerify.jsx'));
const VisaMessages = lazy(() => import('./pages/visa/VisaMessages.jsx'));
const VisaAdminWorkbench = lazy(() => import('./pages/visa/VisaAdminWorkbench.jsx'));
const VisaAdminManage = lazy(() => import('./pages/visa/VisaAdminManage.jsx'));
const VisaAdminStats = lazy(() => import('./pages/visa/VisaAdminStats.jsx'));
const VisaAdminAudit = lazy(() => import('./pages/visa/VisaAdminAudit.jsx'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'));
const AdminRoles = lazy(() => import('./pages/admin/AdminRoles.jsx'));
const AdminServices = lazy(() => import('./pages/admin/AdminServices.jsx'));
const AdminRecognize = lazy(() => import('./pages/admin/AdminRecognize.jsx'));
const DocsLayout = lazy(() => import('./pages/docs/DocsLayout.jsx'));
const DocsHome = lazy(() => import('./pages/docs/DocsHome.jsx'));
const DocsTypes = lazy(() => import('./pages/docs/DocsTypes.jsx'));
const DocsApply = lazy(() => import('./pages/docs/DocsApply.jsx'));
const DocsApplications = lazy(() => import('./pages/docs/DocsApplications.jsx'));
const DocsApplicationDetail = lazy(() => import('./pages/docs/DocsApplicationDetail.jsx'));
const DocsCertificates = lazy(() => import('./pages/docs/DocsCertificates.jsx'));
const DocsCertificateDetail = lazy(() => import('./pages/docs/DocsCertificateDetail.jsx'));
const DocsVerify = lazy(() => import('./pages/docs/DocsVerify.jsx'));
const DocsMessages = lazy(() => import('./pages/docs/DocsMessages.jsx'));
const DocsAdminLayout = lazy(() => import('./pages/admin/docs/DocsAdminLayout.jsx'));
const DocsReview = lazy(() => import('./pages/admin/docs/DocsReview.jsx'));
const DocsTypesAdmin = lazy(() => import('./pages/admin/docs/DocsTypesAdmin.jsx'));
const DocsCertsAdmin = lazy(() => import('./pages/admin/docs/DocsCertsAdmin.jsx'));
const DocsVerifyAdmin = lazy(() => import('./pages/admin/docs/DocsVerifyAdmin.jsx'));
const DocsStats = lazy(() => import('./pages/admin/docs/DocsStats.jsx'));
const DocsNotices = lazy(() => import('./pages/admin/docs/DocsNotices.jsx'));
const DocsAudit = lazy(() => import('./pages/admin/docs/DocsAudit.jsx'));
const DocsSettings = lazy(() => import('./pages/admin/docs/DocsSettings.jsx'));
const ImmigrationHome = lazy(() => import('./pages/immigration/ImmigrationHome.jsx'));
const ImmigrationPorts = lazy(() => import('./pages/immigration/ImmigrationPorts.jsx'));
const ImmigrationPortDetail = lazy(() => import('./pages/immigration/ImmigrationPortDetail.jsx'));
const DeclarationEdit = lazy(() => import('./pages/immigration/DeclarationEdit.jsx'));
const MyDeclarations = lazy(() => import('./pages/immigration/MyDeclarations.jsx'));
const PassCodes = lazy(() => import('./pages/immigration/PassCodes.jsx'));
const ImmigrationRecords = lazy(() => import('./pages/immigration/ImmigrationRecords.jsx'));
const ImmigrationMessages = lazy(() => import('./pages/immigration/ImmigrationMessages.jsx'));
const ImmigrationHelp = lazy(() => import('./pages/immigration/ImmigrationHelp.jsx'));
const ImmigrationVerify = lazy(() => import('./pages/immigration/ImmigrationVerify.jsx'));
const AdminImPorts = lazy(() => import('./pages/immigration/admin/AdminImPorts.jsx'));
const AdminImReview = lazy(() => import('./pages/immigration/admin/AdminImReview.jsx'));
const AdminImVerify = lazy(() => import('./pages/immigration/admin/AdminImVerify.jsx'));
const AdminImRecords = lazy(() => import('./pages/immigration/admin/AdminImRecords.jsx'));
const AdminImStats = lazy(() => import('./pages/immigration/admin/AdminImStats.jsx'));
const AdminImSettings = lazy(() => import('./pages/immigration/admin/AdminImSettings.jsx'));
const AdminImAudit = lazy(() => import('./pages/immigration/admin/AdminImAudit.jsx'));
// 奶龙国皇家外交事务署
const DipShell = lazy(() => import('./pages/dip/DipShell.jsx'));
const DipHome = lazy(() => import('./pages/dip/DipHome.jsx'));
const DipApply = lazy(() => import('./pages/dip/DipApply.jsx'));
const DipRelations = lazy(() => import('./pages/dip/DipRelations.jsx'));
const DipIdentity = lazy(() => import('./pages/dip/DipIdentity.jsx'));
const DipAgreements = lazy(() => import('./pages/dip/DipAgreements.jsx'));
const DipCourtesies = lazy(() => import('./pages/dip/DipCourtesies.jsx'));
const DipOffices = lazy(() => import('./pages/dip/DipOffices.jsx'));
const DipMessages = lazy(() => import('./pages/dip/DipMessages.jsx'));
const DipVerify = lazy(() => import('./pages/dip/DipVerify.jsx'));
const AdminDipReview = lazy(() => import('./pages/dip/admin/AdminDipReview.jsx'));
const AdminDipAgreements = lazy(() => import('./pages/dip/admin/AdminDipAgreements.jsx'));
const AdminDipOffices = lazy(() => import('./pages/dip/admin/AdminDipOffices.jsx'));
const AdminDipVerify = lazy(() => import('./pages/dip/admin/AdminDipVerify.jsx'));
const AdminDipConfig = lazy(() => import('./pages/dip/admin/AdminDipConfig.jsx'));
const AdminDipStats = lazy(() => import('./pages/dip/admin/AdminDipStats.jsx'));
const AdminDipAudit = lazy(() => import('./pages/dip/admin/AdminDipAudit.jsx'));
// 奶龙国皇家居民登记署
const ResidentShell = lazy(() => import('./pages/resident/ResidentShell.jsx'));
const ResidentHome = lazy(() => import('./pages/resident/ResidentHome.jsx'));
const ResidentGuide = lazy(() => import('./pages/resident/ResidentGuide.jsx'));
const ResidentApply = lazy(() => import('./pages/resident/ResidentApply.jsx'));
const ResidentMyApplications = lazy(() => import('./pages/resident/ResidentMyApplications.jsx'));
const ResidentApplicationDetail = lazy(() => import('./pages/resident/ResidentApplicationDetail.jsx'));
const ResidentCard = lazy(() => import('./pages/resident/ResidentCard.jsx'));
const ResidentChanges = lazy(() => import('./pages/resident/ResidentChanges.jsx'));
const ResidentBenefits = lazy(() => import('./pages/resident/ResidentBenefits.jsx'));
const ResidentMessages = lazy(() => import('./pages/resident/ResidentMessages.jsx'));
const ResidentVerify = lazy(() => import('./pages/resident/ResidentVerify.jsx'));
const AdminResReview = lazy(() => import('./pages/resident/admin/AdminResReview.jsx'));
const AdminResChanges = lazy(() => import('./pages/resident/admin/AdminResChanges.jsx'));
const AdminResCards = lazy(() => import('./pages/resident/admin/AdminResCards.jsx'));
const AdminResResidents = lazy(() => import('./pages/resident/admin/AdminResResidents.jsx'));
const AdminResVerify = lazy(() => import('./pages/resident/admin/AdminResVerify.jsx'));
const AdminResTypes = lazy(() => import('./pages/resident/admin/AdminResTypes.jsx'));
const AdminResNotices = lazy(() => import('./pages/resident/admin/AdminResNotices.jsx'));
const AdminResRisk = lazy(() => import('./pages/resident/admin/AdminResRisk.jsx'));
const AdminResStats = lazy(() => import('./pages/resident/admin/AdminResStats.jsx'));
const AdminResSettings = lazy(() => import('./pages/resident/admin/AdminResSettings.jsx'));
const AdminResAudit = lazy(() => import('./pages/resident/admin/AdminResAudit.jsx'));
// 奶龙国皇家礼宾与活动署
const ProtocolShell = lazy(() => import('./pages/protocol/ProtocolShell.jsx'));
const ProtocolHome = lazy(() => import('./pages/protocol/ProtocolHome.jsx'));
const ProtocolEvents = lazy(() => import('./pages/protocol/ProtocolEvents.jsx'));
const ProtocolEventDetail = lazy(() => import('./pages/protocol/ProtocolEventDetail.jsx'));
const ProtocolApply = lazy(() => import('./pages/protocol/ProtocolApply.jsx'));
const ProtocolMyRegistrations = lazy(() => import('./pages/protocol/ProtocolMyRegistrations.jsx'));
const ProtocolInvitations = lazy(() => import('./pages/protocol/ProtocolInvitations.jsx'));
const ProtocolPasses = lazy(() => import('./pages/protocol/ProtocolPasses.jsx'));
const ProtocolHosts = lazy(() => import('./pages/protocol/ProtocolHosts.jsx'));
const ProtocolCourtesy = lazy(() => import('./pages/protocol/ProtocolCourtesy.jsx'));
const ProtocolMessages = lazy(() => import('./pages/protocol/ProtocolMessages.jsx'));
const ProtocolHelp = lazy(() => import('./pages/protocol/ProtocolHelp.jsx'));
const ProtocolVerify = lazy(() => import('./pages/protocol/ProtocolVerify.jsx'));
const AdminProtocolReview = lazy(() => import('./pages/protocol/admin/AdminProtocolReview.jsx'));
const AdminProtocolEvents = lazy(() => import('./pages/protocol/admin/AdminProtocolEvents.jsx'));
const AdminProtocolIssuance = lazy(() => import('./pages/protocol/admin/AdminProtocolIssuance.jsx'));
const AdminProtocolHosts = lazy(() => import('./pages/protocol/admin/AdminProtocolHosts.jsx'));
const AdminProtocolCourtesy = lazy(() => import('./pages/protocol/admin/AdminProtocolCourtesy.jsx'));
const AdminProtocolCheckin = lazy(() => import('./pages/protocol/admin/AdminProtocolCheckin.jsx'));
const AdminProtocolManage = lazy(() => import('./pages/protocol/admin/AdminProtocolManage.jsx'));
const AdminProtocolStats = lazy(() => import('./pages/protocol/admin/AdminProtocolStats.jsx'));
const AdminProtocolAudit = lazy(() => import('./pages/protocol/admin/AdminProtocolAudit.jsx'));
// 奶龙国皇家申诉与监察署
const AppealShell = lazy(() => import('./pages/appeal/AppealShell.jsx'));
const AppealHome = lazy(() => import('./pages/appeal/AppealHome.jsx'));
const AppealGuide = lazy(() => import('./pages/appeal/AppealGuide.jsx'));
const AppealApply = lazy(() => import('./pages/appeal/AppealApply.jsx'));
const AppealMyAppeals = lazy(() => import('./pages/appeal/AppealMyAppeals.jsx'));
const AppealAppealDetail = lazy(() => import('./pages/appeal/AppealAppealDetail.jsx'));
const AppealReviews = lazy(() => import('./pages/appeal/AppealReviews.jsx'));
const AppealComplaints = lazy(() => import('./pages/appeal/AppealComplaints.jsx'));
const AppealTickets = lazy(() => import('./pages/appeal/AppealTickets.jsx'));
const AppealDecisions = lazy(() => import('./pages/appeal/AppealDecisions.jsx'));
const AppealDecisionDoc = lazy(() => import('./pages/appeal/AppealDecisionDoc.jsx'));
const AppealPublicity = lazy(() => import('./pages/appeal/AppealPublicity.jsx'));
const AppealMessages = lazy(() => import('./pages/appeal/AppealMessages.jsx'));
const AppealVerify = lazy(() => import('./pages/appeal/AppealVerify.jsx'));
const AppealAdminWorkbench = lazy(() => import('./pages/appeal/AppealAdminWorkbench.jsx'));
const AppealAdminReviews = lazy(() => import('./pages/appeal/AppealAdminReviews.jsx'));
const AppealAdminDesk = lazy(() => import('./pages/appeal/AppealAdminDesk.jsx'));
const AppealAdminInspect = lazy(() => import('./pages/appeal/AppealAdminInspect.jsx'));
const AppealAdminManage = lazy(() => import('./pages/appeal/AppealAdminManage.jsx'));
const AppealAdminStats = lazy(() => import('./pages/appeal/AppealAdminStats.jsx'));
const AppealAdminAudit = lazy(() => import('./pages/appeal/AppealAdminAudit.jsx'));
// 奶龙国皇家档案与记录署
const ArchShell = lazy(() => import('./pages/archives/ArchShell.jsx'));
const ArchHome = lazy(() => import('./pages/archives/ArchHome.jsx'));
const ArchRecords = lazy(() => import('./pages/archives/ArchRecords.jsx'));
const ArchRecordDetail = lazy(() => import('./pages/archives/ArchRecordDetail.jsx'));
const ArchRequests = lazy(() => import('./pages/archives/ArchRequests.jsx'));
const ArchRequestDetail = lazy(() => import('./pages/archives/ArchRequestDetail.jsx'));
const ArchMessages = lazy(() => import('./pages/archives/ArchMessages.jsx'));
const ArchHelp = lazy(() => import('./pages/archives/ArchHelp.jsx'));
const AdminArchRules = lazy(() => import('./pages/archives/admin/AdminArchRules.jsx'));
const AdminArchRecords = lazy(() => import('./pages/archives/admin/AdminArchRecords.jsx'));
const AdminArchRequests = lazy(() => import('./pages/archives/admin/AdminArchRequests.jsx'));
const AdminArchAccess = lazy(() => import('./pages/archives/admin/AdminArchAccess.jsx'));
const AdminArchAudit = lazy(() => import('./pages/archives/admin/AdminArchAudit.jsx'));
const AdminArchSettings = lazy(() => import('./pages/archives/admin/AdminArchSettings.jsx'));
// 奶龙国皇家邮政与通信署
const PostalShell = lazy(() => import('./pages/postal/PostalShell.jsx'));
const PostalHome = lazy(() => import('./pages/postal/PostalHome.jsx'));
const PostalNotices = lazy(() => import('./pages/postal/PostalNotices.jsx'));
const PostalMessages = lazy(() => import('./pages/postal/PostalMessages.jsx'));
const PostalPostcards = lazy(() => import('./pages/postal/PostalPostcards.jsx'));
const PostalCompose = lazy(() => import('./pages/postal/PostalCompose.jsx'));
const PostalSubscription = lazy(() => import('./pages/postal/PostalSubscription.jsx'));
const AdminPostNotices = lazy(() => import('./pages/postal/admin/AdminPostNotices.jsx'));
const AdminPostTemplates = lazy(() => import('./pages/postal/admin/AdminPostTemplates.jsx'));
const AdminPostCardTemplates = lazy(() => import('./pages/postal/admin/AdminPostCardTemplates.jsx'));
const AdminPostCards = lazy(() => import('./pages/postal/admin/AdminPostCards.jsx'));
const AdminPostStats = lazy(() => import('./pages/postal/admin/AdminPostStats.jsx'));
const AdminPostAudit = lazy(() => import('./pages/postal/admin/AdminPostAudit.jsx'));
// 奶龙国皇家文化旅游署
const TourismShell = lazy(() => import('./pages/tourism/TourismShell.jsx'));
const TourismHome = lazy(() => import('./pages/tourism/TourismHome.jsx'));
const TourismAttractions = lazy(() => import('./pages/tourism/TourismAttractions.jsx'));
const TourismAttractionDetail = lazy(() => import('./pages/tourism/TourismAttractionDetail.jsx'));
const TourismArticles = lazy(() => import('./pages/tourism/TourismArticles.jsx'));
const TourismArticleDetail = lazy(() => import('./pages/tourism/TourismArticleDetail.jsx'));
const TourismCollection = lazy(() => import('./pages/tourism/TourismCollection.jsx'));
const TourismBadges = lazy(() => import('./pages/tourism/TourismBadges.jsx'));
const TourismMy = lazy(() => import('./pages/tourism/TourismMy.jsx'));
const AdminTourAttractions = lazy(() => import('./pages/tourism/admin/AdminTourAttractions.jsx'));
const AdminTourArticles = lazy(() => import('./pages/tourism/admin/AdminTourArticles.jsx'));
const AdminTourRules = lazy(() => import('./pages/tourism/admin/AdminTourRules.jsx'));
const AdminTourBadges = lazy(() => import('./pages/tourism/admin/AdminTourBadges.jsx'));
const AdminTourStats = lazy(() => import('./pages/tourism/admin/AdminTourStats.jsx'));
const AdminTourAudit = lazy(() => import('./pages/tourism/admin/AdminTourAudit.jsx'));
// 奶龙国皇家统计署
const StatsShell = lazy(() => import('./pages/stats/StatsShell.jsx'));
const StatsHome = lazy(() => import('./pages/stats/StatsHome.jsx'));
const StatsReports = lazy(() => import('./pages/stats/StatsReports.jsx'));
const StatsReportDetail = lazy(() => import('./pages/stats/StatsReportDetail.jsx'));
const StatsGuide = lazy(() => import('./pages/stats/StatsGuide.jsx'));
const AdminStatDashboard = lazy(() => import('./pages/stats/admin/AdminStatDashboard.jsx'));
const AdminStatMetrics = lazy(() => import('./pages/stats/admin/AdminStatMetrics.jsx'));
const AdminStatExport = lazy(() => import('./pages/stats/admin/AdminStatExport.jsx'));
const AdminStatAudit = lazy(() => import('./pages/stats/admin/AdminStatAudit.jsx'));
// 奶龙国皇家教育与科学署
const EduShell = lazy(() => import('./pages/education/EduShell.jsx'));
const EduHome = lazy(() => import('./pages/education/EduHome.jsx'));
const EduEntries = lazy(() => import('./pages/education/EduEntries.jsx'));
const EduEntryDetail = lazy(() => import('./pages/education/EduEntryDetail.jsx'));
const EduArticles = lazy(() => import('./pages/education/EduArticles.jsx'));
const EduArticleDetail = lazy(() => import('./pages/education/EduArticleDetail.jsx'));
const EduTasks = lazy(() => import('./pages/education/EduTasks.jsx'));
const EduMy = lazy(() => import('./pages/education/EduMy.jsx'));
const AdminEduReview = lazy(() => import('./pages/education/admin/AdminEduReview.jsx'));
const AdminEduEntries = lazy(() => import('./pages/education/admin/AdminEduEntries.jsx'));
const AdminEduArticles = lazy(() => import('./pages/education/admin/AdminEduArticles.jsx'));
const AdminEduTasks = lazy(() => import('./pages/education/admin/AdminEduTasks.jsx'));
const AdminEduStats = lazy(() => import('./pages/education/admin/AdminEduStats.jsx'));
const AdminEduAudit = lazy(() => import('./pages/education/admin/AdminEduAudit.jsx'));
const AdminEduSettings = lazy(() => import('./pages/education/admin/AdminEduSettings.jsx'));

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
  const { t } = useTranslation();
  return (
    <SetupGate>
      <Suspense fallback={<FullLoading tip={t('common.loading')} />}>
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
      </Suspense>
    </SetupGate>
  );
}
