import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useEffect } from 'react';
import { useThemeStore } from '../stores/theme';

export default function Layout() {
  const { theme } = useThemeStore();

  // Apply data-theme to html element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="flex min-h-screen bg-[var(--surface-secondary)] text-[var(--text-primary)]">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <div className="p-4 lg:p-6 pt-16 lg:pt-6 max-w-7xl mx-auto animate-fadeIn">
          <Outlet />
        </div>
      </main>
    </div>
  );
}