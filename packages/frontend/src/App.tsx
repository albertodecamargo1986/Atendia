import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/auth';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import AgentsPage from './pages/AgentsPage';
import AgentBuilderPage from './pages/AgentBuilderPage';
import ConversationsPage from './pages/ConversationsPage';
import KnowledgePage from './pages/KnowledgePage';
import WhatsAppPage from './pages/WhatsAppPage';
import SettingsPage from './pages/SettingsPage';
import LicensePage from './pages/LicensePage';
import UsersPage from './pages/UsersPage';
import BusinessHoursPage from './pages/BusinessHoursPage';
import TicketsPage from './pages/TicketsPage';
import ContactsPage from './pages/ContactsPage';
import QueuesPage from './pages/QueuesPage';
import QuickRepliesPage from './pages/QuickRepliesPage';
import TagsPage from './pages/TagsPage';
import CampaignsPage from './pages/CampaignsPage';
import ReportsPage from './pages/ReportsPage';
import InternalChatPage from './pages/InternalChatPage';
import VoiceProfilesPage from './pages/VoiceProfilesPage';
import PricingPage from './pages/PricingPage';
import ActivatePage from './pages/ActivatePage';
import OnboardingWizard from './pages/OnboardingWizard';

// Admin pages
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminClientsPage from './pages/AdminClientsPage';
import AdminLicensesPage from './pages/AdminLicensesPage';
import AdminPaymentsPage from './pages/AdminPaymentsPage';
import AdminWebhooksPage from './pages/AdminWebhooksPage';
import AdminPermissionsPage from './pages/AdminPermissionsPage';
import OwnerGuidePage from './pages/OwnerGuidePage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const showOnboarding = isAuthenticated && localStorage.getItem('atendia_onboarding_done') !== 'true';

  return (
    <BrowserRouter>
      {showOnboarding && <OnboardingWizard />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/activate" element={<ActivatePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/new" element={<AgentBuilderPage />} />
          <Route path="agents/:id" element={<AgentBuilderPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="queues" element={<QueuesPage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="quick-replies" element={<QuickRepliesPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="internal-chat" element={<InternalChatPage />} />
          <Route path="voice-profiles" element={<VoiceProfilesPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="whatsapp" element={<WhatsAppPage />} />
          <Route path="business-hours" element={<BusinessHoursPage />} />
          <Route path="team" element={<UsersPage />} />
          <Route path="license" element={<LicensePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="onboarding" element={<OnboardingWizard />} />
        </Route>

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={
            <PrivateRoute>
              <AdminLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="clients" element={<AdminClientsPage />} />
          <Route path="licenses" element={<AdminLicensesPage />} />
          <Route path="payments" element={<AdminPaymentsPage />} />
          <Route path="webhooks" element={<AdminWebhooksPage />} />
          <Route path="permissions" element={<AdminPermissionsPage />} />
          <Route path="owner-guide" element={<OwnerGuidePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
