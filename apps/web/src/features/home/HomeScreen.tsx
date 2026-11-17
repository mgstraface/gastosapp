import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, daysInMonth, formatMoney, localDate, monthLabel, monthOf, monthSummary, monthlyTrend } from '@gastosapp/shared';
import { MonthPicker, useMonth } from '../../components/MonthPicker';
import { MovementRow } from '../../components/MovementRow';
import { useSettings, useStore } from '../../lib/store';
import { useRegister } from '../movements/registerContext';

export function HomeScreen() {
  const settings = useSettings();
  const movements = useStore((s) => s.movements);
  const user = useStore((s) => s.user);
  const open = useRegister();
  const [month, setMonth] = useMonth();
  const cur = settings.currency;

  const summary = useMemo(() => monthSummary(movements, month, settings, addMonths(month, 1)), [movements, month, settings]);
  const trend = useMemo(() => monthlyTrend(movements, month, 6, cur), [movements, month, cur]);
  const t = summary.totals[cur];
  const other = summary.totals[cur === 'ARS' ? 'USD' : 'ARS'];
  const otherCur = cur === 'ARS' ? 'USD' : 'ARS';
  const hasOther = other.gastos > 0 || other.ingresos > 0;

  // Promedio por día: en el mes actual, sobre los días que pasaron.
  const today = localDate();
  const isCurrent = month === monthOf(today);
  const daysElapsed = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(month);
  const perDay = daysElapsed > 0 ? Math.round(t.gastos / daysElapsed) : 0;

  const totalBudget = settings.categories.reduce((s, c) => s + (c.kind === 'gasto' && !c.archived && c.budget ? c.budget : 0), 0);
  const trendMax = Math.max(1, ...trend.map((x) => Math.max(x.gastos, x.ingresos)));
  const recent = summary.lines.slice(0, 6);

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Hola, {user?.displayName}</p>
        <MonthPicker month={month} onChange={setMonth} />
      </header>

      <section className="hero">
        <p className="hero-label">Gastaste</p>
        <p className="hero-amount">{formatMoney(t.gastos, cur)}</p>
        {totalBudget > 0 && (
          <div className="budget-bar" aria-label={`Presupuesto total ${formatMoney(totalBudget, cur)}`}>
            <span style={{ width: `${Math.min(100, (t.gastos / totalBudget) * 100)}%` }} className={t.gastos > totalBudget ? 'is-over' : ''} />
          </div>
        )}
        <div className="hero-grid">
          <div>
            <small>Ingresos</small>
            <strong>{formatMoney(t.ingresos, cur)}</strong>
          </div>
          <div>
            <small>Balance</small>
            <strong className={t.balance < 0 ? 'neg' : ''}>{formatMoney(t.balance, cur, { sign: true })}</strong>
          </div>
          <div>
            <small>{isCurrent ? 'Por día (hasta hoy)' : 'Por día'}</small>
            <strong>{formatMoney(perDay, cur)}</strong>
          </div>
          {totalBudget > 0 && (
            <div>
              <small>{t.gastos > totalBudget ? 'Te pasaste' : 'Te queda'}</small>
              <strong className={t.gastos > totalBudget ? 'neg' : ''}>{formatMoney(Math.abs(totalBudget - t.gastos), cur)}</strong>
            </div>
          )}
        </div>
        {hasOther && (
          <p className="hero-other">
            En {otherCur === 'USD' ? 'dólares' : 'pesos'}: gastos {formatMoney(other.gastos, otherCur)} · ingresos {formatMoney(other.ingresos, otherCur)}
          </p>
        )}
      </section>

      {summary.nextMonthCommitted > 0 && (
        <p className="notice">
          💳 Ya hay {formatMoney(summary.nextMonthCommitted, cur)} en cuotas para {monthLabel(addMonths(month, 1))}.
        </p>
      )}

      <section className="card">
        <header className="card-head">
          <h2>Por categoría</h2>
          <Link to="/categorias" className="link">
            Presupuestos
          </Link>
        </header>
        {summary.byCategory.length === 0 ? (
          <div className="empty">
            <p>Todavía no hay gastos este mes.</p>
            <button type="button" className="btn-primary" onClick={() => open({ mode: 'new' })}>
              Cargar el primero
            </button>
          </div>
        ) : (
          <ul className="cat-list">
            {summary.byCategory.map((row) => {
              const pct = t.gastos > 0 ? Math.round((row.total / t.gastos) * 100) : 0;
              const over = row.ratio !== null && row.ratio > 1;
              return (
                <li key={row.category.key}>
                  <Link to={`/movimientos?${new URLSearchParams({ ...(month !== monthOf(today) ? { mes: month } : {}), cat: row.category.key })}`} className="cat-row">
                    <span className="cat-row-emoji" aria-hidden="true">
                      {row.category.emoji}
                    </span>
                    <span className="cat-row-main">
                      <span className="cat-row-top">
                        <strong>{row.category.name}</strong>
                        <span>{formatMoney(row.total, cur)}</span>
                      </span>
                      <span className="cat-row-bar">
                        <span
                          style={{
                            width: `${row.category.budget ? Math.min(100, (row.ratio ?? 0) * 100) : pct}%`,
                            background: over ? 'var(--over)' : row.category.color,
                          }}
                        />
                      </span>
                      <small className={over ? 'neg' : ''}>
                        {row.category.budget
                          ? over
                            ? `Te pasaste ${formatMoney(row.total - row.category.budget, cur)} de ${formatMoney(row.category.budget, cur)}`
                            : `Quedan ${formatMoney(row.category.budget - row.total, cur)} de ${formatMoney(row.category.budget, cur)}`
                          : `${pct}% del mes · ${row.count} ${row.count === 1 ? 'movimiento' : 'movimientos'}`}
                      </small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {trend.some((x) => x.gastos > 0 || x.ingresos > 0) && (
        <section className="card">
          <header className="card-head">
            <h2>Últimos 6 meses</h2>
            <span className="legend">
              <i className="lg-gasto" /> gastos <i className="lg-ingreso" /> ingresos
            </span>
          </header>
          <div className="trend">
            {trend.map((x) => (
              <button key={x.month} type="button" className={`trend-col${x.month === month ? ' is-on' : ''}`} onClick={() => setMonth(x.month)}>
                <span className="trend-bars">
                  <span className="tb-gasto" style={{ height: `${(x.gastos / trendMax) * 100}%` }} />
                  <span className="tb-ingreso" style={{ height: `${(x.ingresos / trendMax) * 100}%` }} />
                </span>
                <small>{monthLabel(x.month).slice(0, 3)}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="card">
          <header className="card-head">
            <h2>Últimos movimientos</h2>
            <Link to={`/movimientos${month !== monthOf(today) ? `?mes=${month}` : ''}`} className="link">
              Ver todos
            </Link>
          </header>
          <div className="mov-list">
            {recent.map((l) => (
              <MovementRow key={l.movement.id} line={l} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
