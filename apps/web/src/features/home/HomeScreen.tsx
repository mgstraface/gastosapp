import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  accountBalances,
  addMonths,
  convert,
  daysInMonth,
  formatMoney,
  localDate,
  monthLabel,
  monthOf,
  monthSummary,
  monthlyTrend,
  pendingRecurring,
  personBalances,
  recurringDate,
} from '@gastosapp/shared';
import { MonthPicker, useMonth } from '../../components/MonthPicker';
import { MovementRow } from '../../components/MovementRow';
import { useRate, useSettings, useStore } from '../../lib/store';
import { useRegister } from '../movements/registerContext';

export function HomeScreen() {
  const settings = useSettings();
  const movements = useStore((s) => s.movements);
  const user = useStore((s) => s.user);
  const rate = useRate();
  const open = useRegister();
  const [month, setMonth] = useMonth();
  const cur = settings.currency;
  const otherCur = cur === 'ARS' ? 'USD' : 'ARS';

  const summary = useMemo(() => monthSummary(movements, month, settings, { nextMonth: addMonths(month, 1), rate }), [movements, month, settings, rate]);
  const trend = useMemo(() => monthlyTrend(movements, month, 6, cur, rate), [movements, month, cur, rate]);
  // Totales en la moneda principal (con la otra convertida si hay cotización)
  const t = summary.main;
  const other = summary.totals[otherCur];
  const hasOther = other.gastos > 0 || other.ingresos > 0;

  // Promedio por día: en el mes actual, sobre los días que pasaron.
  const today = localDate();
  const isCurrent = month === monthOf(today);
  const daysElapsed = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(month);
  const perDay = daysElapsed > 0 ? Math.round(t.gastos / daysElapsed) : 0;

  const totalBudget = settings.categories.reduce((s, c) => s + (c.kind === 'gasto' && !c.archived && c.budget ? c.budget : 0), 0);
  const trendMax = Math.max(1, ...trend.map((x) => Math.max(x.gastos, x.ingresos)));
  const recent = summary.lines.slice(0, 6);
  const balances = useMemo(() => accountBalances(movements, settings, today), [movements, settings, today]);
  const accounts = balances.accounts.filter((r) => !r.account.archived && r.account.type === 'normal');
  const hasUsd = accounts.some((r) => r.account.currency === otherCur);
  const otherInMain = convert(balances.totals[otherCur], otherCur, cur, rate);
  const totalMoney = balances.totals[cur] + (otherInMain ?? 0);

  // Fijos que faltan cargar (solo mirando este mes o los que vienen)
  const pending = month >= monthOf(today) ? pendingRecurring(settings, movements, month) : [];
  const people = useMemo(() => personBalances(movements, settings).filter((p) => p.balance.ARS !== 0 || p.balance.USD !== 0), [movements, settings]);

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
            {/* Mes actual: lo que queda en las cuentas hoy. Meses pasados: ingresos − gastos de ese mes. */}
            {isCurrent ? (
              <>
                <small>Te queda{hasUsd && otherInMain !== null ? ' (todo en pesos)' : ''}</small>
                <strong className={totalMoney < 0 ? 'neg' : ''}>{formatMoney(totalMoney, cur)}</strong>
              </>
            ) : (
              <>
                <small>Resultado del mes</small>
                <strong className={t.balance < 0 ? 'neg' : ''}>{formatMoney(t.balance, cur, { sign: true })}</strong>
              </>
            )}
          </div>
          <div>
            <small>{isCurrent ? 'Por día (hasta hoy)' : 'Por día'}</small>
            <strong>{formatMoney(perDay, cur)}</strong>
          </div>
          {summary.saved !== 0 ? (
            <div>
              <small>{summary.saved > 0 ? 'Ahorraste' : 'Sacaste del ahorro'}</small>
              <strong>{formatMoney(Math.abs(summary.saved), cur)}</strong>
            </div>
          ) : (
            totalBudget > 0 && (
              <div>
                <small>{t.gastos > totalBudget ? 'Te pasaste del presupuesto' : 'Queda de presupuesto'}</small>
                <strong className={t.gastos > totalBudget ? 'neg' : ''}>{formatMoney(Math.abs(totalBudget - t.gastos), cur)}</strong>
              </div>
            )
          )}
        </div>
        {hasOther && (
          <p className="hero-other">
            {t.converted && rate
              ? `Incluye ${formatMoney(other.gastos, otherCur)} en gastos en ${otherCur === 'USD' ? 'dólares' : 'pesos'}, a ${formatMoney(Math.round(rate * 100), 'ARS')}.`
              : `En ${otherCur === 'USD' ? 'dólares' : 'pesos'}: gastos ${formatMoney(other.gastos, otherCur)} · ingresos ${formatMoney(other.ingresos, otherCur)}`}
          </p>
        )}
      </section>

      {settings.budgetAlerts &&
        summary.alerts.map((r) => (
          <Link key={r.category.key} to="/categorias" className={`notice alert${r.ratio! > 1 ? ' is-over' : ''}`}>
            {r.category.emoji}{' '}
            {r.ratio! > 1
              ? `Te pasaste del tope de ${r.category.name}: ${formatMoney(r.total, cur)} de ${formatMoney(r.category.budget!, cur)}.`
              : `${r.category.name}: vas por el ${Math.round(r.ratio! * 100)} % del tope (quedan ${formatMoney(r.category.budget! - r.total, cur)}).`}
          </Link>
        ))}

      {pending.length > 0 && (
        <section className="card">
          <header className="card-head">
            <h2>Fijos por cargar</h2>
            <Link to="/fijos" className="link">
              Editar
            </Link>
          </header>
          <ul className="plain-list">
            {pending.map((r) => {
              const c = settings.categories.find((x) => x.key === r.categoryKey);
              const date = recurringDate(r, month);
              const late = date < today;
              return (
                <li key={r.key}>
                  <button
                    type="button"
                    className="cat-line"
                    onClick={() =>
                      open({
                        mode: 'new',
                        prefill: {
                          kind: r.kind,
                          amount: r.amount,
                          categoryKey: r.categoryKey,
                          accountKey: r.accountKey,
                          description: r.description,
                          date: date > today && isCurrent ? today : date,
                          method: r.method,
                          recurringKey: r.key,
                        },
                      })
                    }
                  >
                    <span className="mov-icon" aria-hidden="true">
                      {c?.emoji ?? '📌'}
                    </span>
                    <span className="mov-text">
                      <strong>{r.description}</strong>
                      <small className={late ? 'neg' : ''}>
                        {r.kind === 'ingreso' ? 'Se cobra' : late ? 'Venció' : 'Vence'} el {Number(date.slice(8))}
                      </small>
                    </span>
                    <span className={`mov-amount${r.kind === 'ingreso' ? ' is-income' : ''}`}>
                      {formatMoney(r.amount, r.currency)}
                      <small>Cargar ›</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Link to="/cuentas" className="card money-card">
        <header className="card-head">
          <h2>Tu plata hoy</h2>
          <span className="money-total">
            {formatMoney(balances.totals[cur], cur)}
            {hasUsd && <small> + {formatMoney(balances.totals[otherCur], otherCur)}</small>}
          </span>
        </header>
        <div className="acc-strip">
          {accounts.map((r) => (
            <span key={r.account.key} className="acc-pill" style={{ borderColor: r.account.color }}>
              <span aria-hidden="true">{r.account.emoji}</span> {r.account.name}
              <strong className={r.balance < 0 ? 'neg' : ''}>{formatMoney(r.balance, r.account.currency)}</strong>
            </span>
          ))}
        </div>
        {hasUsd && otherInMain !== null && rate && (
          <small className="hint">
            Todo en pesos: {formatMoney(totalMoney, cur)} (dólar a {formatMoney(Math.round(rate * 100), 'ARS')})
          </small>
        )}
        {balances.cardDebt[cur] > 0 && (
          <small className="hint">
            En tarjetas debés {formatMoney(balances.cardDebt[cur], cur)}: después de pagarlas te quedarían {formatMoney(balances.totals[cur] - balances.cardDebt[cur], cur)}.
          </small>
        )}
        {balances.unassignedCount > 0 && <small className="hint">Hay {balances.unassignedCount} movimientos sin cuenta: tocá para ordenarlos.</small>}
      </Link>

      {people.length > 0 && (
        <Link to="/compartidos" className="card money-card">
          <header className="card-head">
            <h2>Compartidos</h2>
            <span className="link">Ver ›</span>
          </header>
          <div className="acc-strip">
            {people.map((p) => {
              const person = settings.people.find((x) => x.key === p.key);
              return (['ARS', 'USD'] as const)
                .filter((c) => p.balance[c] !== 0)
                .map((c) => (
                  <span key={p.key + c} className="acc-pill">
                    <span>
                      {person?.emoji} {person?.name ?? p.key}
                    </span>
                    <strong className={p.balance[c] < 0 ? 'neg' : 'pos'}>
                      {p.balance[c] > 0 ? 'Te debe ' : 'Le debés '}
                      {formatMoney(Math.abs(p.balance[c]), c)}
                    </strong>
                  </span>
                ));
            })}
          </div>
        </Link>
      )}

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
