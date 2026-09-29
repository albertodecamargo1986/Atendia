import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout() {
  const { user, authChecked } = useAuthStore();

  // Espera o checkAuth terminar antes de decidir (evita expulsar quem é admin)
  if (!authChecked || (!user && localStorage.getItem('accessToken'))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-secondary)]">
        <div className="flex flex-col items-center gap-3 text-[var(--text-secondary)]">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen bg-[var(--surface-secondary)] text-[var(--text-primary)]">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-4 pt-16 lg:p-6 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
