import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Layout } from './Layout';
import { LoginScreen } from '../features/auth/LoginScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { MovementsScreen } from '../features/movements/MovementsScreen';
import { CategoriesScreen } from '../features/categories/CategoriesScreen';
import { AccountsScreen } from '../features/accounts/AccountsScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { AdminScreen } from '../features/admin/AdminScreen';

export function App() {
  const status = useStore((s) => s.status);
  const bootError = useStore((s) => s.bootError);
  const boot = useStore((s) => s.boot);
  const isAdmin = useStore((s) => s.user?.role === 'admin');

  useEffect(() => {
    void boot();
  }, [boot]);

  if (status === 'loading') {
    return (
      <div className="splash">
        <img src="/favicon.svg" alt="" width={96} height={96} />
        <p>Un segundito…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="splash">
        <img src="/favicon.svg" alt="" width={96} height={96} />
        <p>{bootError ?? 'No pudimos conectarnos.'}</p>
        <button type="button" className="btn-primary" onClick={() => void boot()}>
          Probar de nuevo
        </button>
      </div>
    );
  }

  if (status === 'anon') return <LoginScreen />;

  return (
    <BrowserRouter>
      <Routes>
        {isAdmin && <Route path="admin" element={<AdminScreen />} />}
        <Route element={<Layout />}>
          <Route index element={<HomeScreen />} />
          <Route path="movimientos" element={<MovementsScreen />} />
          <Route path="cuentas" element={<AccountsScreen />} />
          <Route path="categorias" element={<CategoriesScreen />} />
          <Route path="yo" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
