import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { useAuthStore } from './stores/auth';
import { useThemeStore } from './stores/theme';
import { SocketProvider } from './hooks/useSocket';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmDialogHost } from './components/ui/ConfirmDialog';
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
import WebhooksPage from './pages/WebhooksPage';
import PricingPage from './pages/PricingPage';
import OnboardingPage from './pages/OnboardingPage';
import SubscriptionPage from './pages/SubscriptionPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminClientsPage from './pages/AdminClientsPage';
import AdminPaymentsPage from './pages/AdminPaymentsPage';
import AdminPermissionsPage from './pages/AdminPermissionsPage';
import AdminOnlinePage from './pages/AdminOnlinePage';
import OwnerGuidePage from './pages/OwnerGuidePage';
import UpgradePage from './pages/UpgradePage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminAuditLogsPage from './pages/AdminAuditLogsPage';
import AdminCouponsPage from './pages/AdminCouponsPage';
import AdminMercadoPagoPage from './pages/AdminMercadoPagoPage';
import AdminPlansPage from './pages/AdminPlansPage';

const MANAGERS = ['SUPER_ADMIN', 'OWNER', 'ADMIN'];
const SUPERVISORS = [...MANAGERS, 'SUPERVISOR'];

function FullScreenLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-secondary)]">
      <div className="flex flex-col items-center gap-3 text-[var(--text-secondary)]">
        <div className="w-8 h-8 border-2 border-[var(--color-primary-500)] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Carregando...</span>
      </div>
    </div>
  );
}

function PrivateRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

/** Bloqueia rotas por papel (ex.: operador não entra em Agentes). */
function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user, authChecked } = useAuthStore();
  if (!authChecked || !user) return <FullScreenLoading />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Usuário logado que abre /login ou /register vai direto para o painel. */
function PublicOnly({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
}

function AppRoutes() {
  const location = useLocation();
  const m = (el: ReactNode) => <RequireRole roles={MANAGERS}>{el}</RequireRole>;
  const sup = (el: ReactNode) => <RequireRole roles={SUPERVISORS}>{el}</RequireRole>;

  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/onboarding" element={<PrivateRoute>{m(<OnboardingPage />)}</PrivateRoute>} />
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
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="quick-replies" element={<QuickRepliesPage />} />
          <Route path="internal-chat" element={<InternalChatPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="reports" element={sup(<ReportsPage />)} />
          <Route path="queues" element={sup(<QueuesPage />)} />
          <Route path="agents" element={m(<AgentsPage />)} />
          <Route path="agents/new" element={m(<AgentBuilderPage />)} />
          <Route path="agents/:id" element={m(<AgentBuilderPage />)} />
          <Route path="subscription" element={m(<SubscriptionPage />)} />
          <Route path="tags" element={m(<TagsPage />)} />
          <Route path="campaigns" element={m(<CampaignsPage />)} />
          <Route path="voice-profiles" element={m(<VoiceProfilesPage />)} />
          <Route path="knowledge" element={m(<KnowledgePage />)} />
          <Route path="whatsapp" element={m(<WhatsAppPage />)} />
          <Route path="business-hours" element={m(<BusinessHoursPage />)} />
          <Route path="integrations" element={m(<WebhooksPage />)} />
          <Route path="team" element={m(<UsersPage />)} />
          <Route path="upgrade" element={m(<UpgradePage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>

        {/* Área do dono da plataforma (somente SUPER_ADMIN) */}
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
          <Route path="payments" element={<AdminPaymentsPage />} />
          <Route path="permissions" element={<AdminPermissionsPage />} />
          <Route path="coupons" element={<AdminCouponsPage />} />
          <Route path="mercadopago" element={<AdminMercadoPagoPage />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="online" element={<AdminOnlinePage />} />
          <Route path="plans" element={<AdminPlansPage />} />
          <Route path="owner-guide" element={<OwnerGuidePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  return (
    <BrowserRouter>
      <SocketProvider>
        <AppRoutes />
        <ConfirmDialogHost />
        <Toaster richColors position="top-right" theme={theme} closeButton />
      </SocketProvider>
    </BrowserRouter>
  );
}
