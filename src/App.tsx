import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import LoginPage    from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import HistoryPage   from '@/pages/HistoryPage';
import ProgressPage  from '@/pages/ProgressPage';
import GoalsPage     from '@/pages/GoalsPage';
import SettingsPage  from '@/pages/SettingsPage';
import BottomNav     from '@/components/BottomNav';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/login" replace />;
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/"          element={<DashboardPage />} />
          <Route path="/history"  element={<HistoryPage />}  />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/goals"    element={<GoalsPage />}    />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  );
}
