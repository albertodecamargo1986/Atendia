import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout() {
  const { user } = useAuthStore();

  if (!user || (user.role !== 'OWNER' && user.role !== 'ADMIN')) {
    return <Navigate to="/" />;
  }

  return (
    <div className="flex h-screen bg-[var(--surface-secondary)]">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
