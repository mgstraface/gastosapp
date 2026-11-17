import { addMonths } from './dates';
import type { Currency } from './money';
import { lineForMonth, lastMonthOf, type MonthLine, type Movement } from './movement';
import type { Category, Settings } from './settings';

export interface CurrencyTotals {
  gastos: number;
  ingresos: number;
  balance: number;
}

export interface CategoryRow {
  category: Category;
  /** Total del mes en la moneda principal (centavos) */
  total: number;
  count: number;
  /** total / budget (null si no hay presupuesto) */
  ratio: number | null;
}

export interface MonthSummary {
  month: string;
  lines: MonthLine[];
  totals: Record<Currency, CurrencyTotals>;
  /** Gastos por categoría en la moneda principal, de mayor a menor */
  byCategory: CategoryRow[];
  /** Ingresos por categoría en la moneda principal */
  incomeByCategory: CategoryRow[];
  /** Cuotas que ya están comprometidas para el mes siguiente, en la moneda principal */
  nextMonthCommitted: number;
}

const UNKNOWN: Category = { key: '?', name: 'Sin categoría', emoji: '🏷️', color: '#8a94a6', kind: 'gasto', budget: null, archived: true };

export function categoryOf(settings: Settings, key: string): Category {
  return settings.categories.find((c) => c.key === key) ?? { ...UNKNOWN, key };
}

export function monthSummary(movements: Movement[], month: string, settings: Settings, nextMonth?: string): MonthSummary {
  const lines: MonthLine[] = [];
  for (const m of movements) {
    const l = lineForMonth(m, month);
    if (l) lines.push(l);
  }
  lines.sort((a, b) => (a.movement.date === b.movement.date ? b.movement.createdAt.localeCompare(a.movement.createdAt) : b.movement.date.localeCompare(a.movement.date)));

  const totals: Record<Currency, CurrencyTotals> = {
    ARS: { gastos: 0, ingresos: 0, balance: 0 },
    USD: { gastos: 0, ingresos: 0, balance: 0 },
  };
  const cats = new Map<string, { total: number; count: number; kind: 'gasto' | 'ingreso' }>();
  for (const l of lines) {
    const t = totals[l.movement.currency];
    if (l.movement.kind === 'gasto') t.gastos += l.amount;
    else t.ingresos += l.amount;
    if (l.movement.currency === settings.currency) {
      const key = l.movement.categoryKey;
      const c = cats.get(key) ?? { total: 0, count: 0, kind: l.movement.kind };
      c.total += l.amount;
      c.count += 1;
      cats.set(key, c);
    }
  }
  for (const t of Object.values(totals)) t.balance = t.ingresos - t.gastos;

  const rows = (kind: 'gasto' | 'ingreso'): CategoryRow[] => {
    const out: CategoryRow[] = [];
    // primero las que tienen movimientos, después las que solo tienen presupuesto
    for (const [key, c] of cats) {
      if (c.kind !== kind) continue;
      const category = categoryOf(settings, key);
      out.push({ category, total: c.total, count: c.count, ratio: category.budget ? c.total / category.budget : null });
    }
    if (kind === 'gasto') {
      for (const category of settings.categories) {
        if (category.kind === 'gasto' && category.budget && !category.archived && !cats.has(category.key)) {
          out.push({ category, total: 0, count: 0, ratio: 0 });
        }
      }
    }
    return out.sort((a, b) => b.total - a.total);
  };

  let nextMonthCommitted = 0;
  if (nextMonth) {
    for (const m of movements) {
      if (m.installments > 1 && m.kind === 'gasto' && m.currency === settings.currency && lastMonthOf(m) >= nextMonth) {
        const l = lineForMonth(m, nextMonth);
        if (l) nextMonthCommitted += l.amount;
      }
    }
  }

  return { month, lines, totals, byCategory: rows('gasto'), incomeByCategory: rows('ingreso'), nextMonthCommitted };
}

/** Gastos por mes (moneda principal) para los últimos n meses terminando en `month`. */
export function monthlyTrend(movements: Movement[], month: string, n: number, currency: Currency) {
  const out: { month: string; gastos: number; ingresos: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const mm = addMonths(month, -i);
    let gastos = 0;
    let ingresos = 0;
    for (const m of movements) {
      if (m.currency !== currency) continue;
      const l = lineForMonth(m, mm);
      if (!l) continue;
      if (m.kind === 'gasto') gastos += l.amount;
      else ingresos += l.amount;
    }
    out.push({ month: mm, gastos, ingresos });
  }
  return out;
}
