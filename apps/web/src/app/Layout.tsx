import { useState } from 'react';
import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { localDate, monthOf, monthSchema } from '@gastosapp/shared';
import { MovementSheet } from '../features/movements/MovementSheet';
import { RegisterContext, type MovementSheetTarget } from '../features/movements/registerContext';
import { useStore } from '../lib/store';

const tabs = [
  { to: '/', label: 'Mes', icon: IconMonth, end: true },
  { to: '/movimientos', label: 'Movimientos', icon: IconList },
  { to: '/cuentas', label: 'Cuentas', icon: IconWallet },
  { to: '/truco', label: 'Truco', icon: IconCards },
  { to: '/yo', label: 'Yo', icon: IconMe },
];

export function Layout() {
  const [target, setTarget] = useState<MovementSheetTarget | null>(null);
  const toast = useStore((s) => s.toast);
  // Si se está mirando un mes anterior, el "+" propone el último día de ese mes.
  const [params] = useSearchParams();
  const mes = params.get('mes');
  const today = localDate();
  const pastDate = mes && monthSchema.safeParse(mes).success && mes < monthOf(today) ? lastDayOf(mes) : undefined;

  return (
    <RegisterContext.Provider value={setTarget}>
      <div className="shell">
        <main className="shell-main">
          <Outlet />
        </main>

        <nav className="tabbar" aria-label="Secciones">
          {tabs.slice(0, 2).map((t) => (
            <Tab key={t.to} {...t} />
          ))}
          <button type="button" className="tabbar-add" onClick={() => setTarget({ mode: 'new', date: pastDate })} aria-label="Cargar un gasto">
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
          {tabs.slice(2).map((t) => (
            <Tab key={t.to} {...t} />
          ))}
        </nav>

        <MovementSheet target={target} onClose={() => setTarget(null)} />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </RegisterContext.Provider>
  );
}

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

function Tab({ to, label, icon: Icon, end }: (typeof tabs)[number]) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `tab${isActive ? ' is-active' : ''}`}>
      <Icon />
      <span>{label}</span>
    </NavLink>
  );
}

function IconMonth() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}
function IconList() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M9 7h11M9 12h11M9 17h11" />
      <circle cx="5" cy="7" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}
function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <rect x="4" y="8" width="16" height="11" rx="2.5" />
      <circle cx="15.5" cy="13.5" r="1.2" fill="currentColor" />
    </svg>
  );
}
function IconCards() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3.5" y="5" width="10" height="14.5" rx="1.8" transform="rotate(-10 8.5 12)" />
      <rect x="10.5" y="4.5" width="10" height="14.5" rx="1.8" transform="rotate(8 15.5 12)" />
      <path d="M15.6 9.6c-1 1.2-1.6 2-1.6 2.8a1.6 1.6 0 0 0 3.2 0c0-.8-.6-1.6-1.6-2.8z" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconMe() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 19.5c1.3-3.2 4-4.8 7-4.8s5.7 1.6 7 4.8" strokeLinecap="round" />
    </svg>
  );
}
