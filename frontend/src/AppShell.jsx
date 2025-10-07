import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import VaultPage from './pages/VaultPage';
import Header from './components/Header';
import Admin from './pages/Admin';
import { useState, useEffect, useLayoutEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import Profile from './pages/Profile';
import { apiGet } from './utils/api';
import { ToastProvider } from './contexts/ToastContext';
import BackgroundCanvas from './components/BackgroundCanvas';
import Spinner from './components/Spinner';

function Shell({ dark, setDark }) {
  const { user, userMeta } = useAuth();
  const [vaults, setVaults] = useState([]);
  const [selectedVault, setSelectedVault] = useState(null);
  const [vaultsLoading, setVaultsLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const location = useLocation();
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [lastUserId, setLastUserId] = useState(null);
  const [showBg, setShowBg] = useState(true);

  async function reloadVaults() {
    setVaultsLoading(true);
    const t0 = performance.now();
    try {
      const v = await apiGet('/api/vaults');
      setVaults(v);
      setError('');
    } catch (e) {
      setError('Failed to load vaults. ' + (e?.message || String(e)));
    } finally {
      const elapsed = performance.now() - t0;
      const remaining = Math.max(0, 500 - elapsed);
      setTimeout(() => setVaultsLoading(false), remaining);
    }
  }

  useEffect(() => {
    if (user && userMeta && userMeta.role !== 'superadmin') reloadVaults();
  }, [user, userMeta]);

  useEffect(() => {
    if (user?.id !== lastUserId) {
      setVaults([]);
      setSelectedVault(null);
      setError('');
      setLastUserId(user?.id || null);
    }
  }, [user?.id]);

  const doLogout = () => {
    setSelectedVault(null);
    navigate('/auth');
  };

  const globalLoading = user && userMeta === undefined;

  // Show a minimal 500ms loader on any route change; useLayoutEffect to set before paint
  useLayoutEffect(() => {
    setRouteLoading(true);
    const id = setTimeout(() => setRouteLoading(false), 500);
    return () => clearTimeout(id);
  }, [location.pathname, location.search, location.hash]);

  function RequireAuth({ children }) {
    if (!user) return <Navigate to="/auth" replace />;
    return children;
  }

  function RequireUser({ children }) {
    if (!user) return <Navigate to="/auth" replace />;
    if (userMeta && userMeta.role === 'superadmin') return <Navigate to="/admin" replace />;
    return children;
  }

  function RequireAdmin({ children }) {
    if (!user) return <Navigate to="/auth" replace />;
    if (!userMeta || userMeta.role !== 'superadmin') return <Navigate to="/dashboard" replace />;
    return children;
  }

  function VaultRouteWrapper() {
    const { vaultId } = useParams();
    const v = selectedVault && selectedVault.vault_id === vaultId ? selectedVault : { vault_id: vaultId };
    return <VaultPage vault={v} goBack={() => navigate('/dashboard')} />;
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-black dark:text-neutral-100 relative">
        {showBg && <BackgroundCanvas />}
        <Header
          onLogout={doLogout}
          onToggleDark={() => setDark(d => !d)}
          isDark={dark}
          onToggleBg={() => setShowBg(s => !s)}
          bgEnabled={showBg}
        />
        <main className="container-responsive py-4 relative z-10" aria-busy={globalLoading || routeLoading}>
          {(globalLoading || routeLoading) ? (
            <div className="min-h-[60vh] grid place-items-center">
              <div className="flex flex-col items-center gap-4">
                <Spinner size={48} radius={20} />
                <div className="text-sm font-medium tracking-wide text-slate-700 dark:text-neutral-300">Loading...</div>
              </div>
            </div>
          ) : (
            <Routes>
              <Route path="/auth" element={user ? <Navigate to={userMeta?.role === 'superadmin' ? '/admin' : '/dashboard'} replace /> : <AuthPage />} />
              <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
              <Route path="/dashboard" element={<RequireUser><Dashboard vaults={vaults} vaultsLoading={vaultsLoading} setVaults={setVaults} selectVault={(v) => { setSelectedVault(v); navigate(`/vault/${v.vault_id}`) }} reloadVaults={reloadVaults} /></RequireUser>} />
              <Route path="/vault/:vaultId" element={<RequireUser><VaultRouteWrapper /></RequireUser>} />
              <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
              <Route path="/" element={<Navigate to={user ? (userMeta?.role === 'superadmin' ? '/admin' : '/dashboard') : '/auth'} replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </ToastProvider>
  );
}

export default function AppShell(props) {
  return (
    <AuthProvider>
      <Shell {...props} />
    </AuthProvider>
  );
}
