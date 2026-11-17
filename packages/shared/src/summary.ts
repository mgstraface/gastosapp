import { addMonths, monthOf } from './dates';
import { convert, type Currency } from './money';
import { lineForMonth, type MonthLine, type Movement } from './movement';
import type { Category, Recurring, Settings } from './settings';

export interface CurrencyTotals {
  gastos: number;
  ingresos: number;
  balance: number;
}

export interface CategoryRow {
  category: Category;
  /** Total del mes en la moneda principal (centavos), con lo de la otra moneda convertido si hay cotización */
  total: number;
  count: number;
  /** total / budget (null si no hay presupuesto) */
  ratio: number | null;
}

export interface MonthSummary {
  month: string;
  lines: MonthLine[];
  /** Totales por moneda, sin convertir */
  totals: Record<Currency, CurrencyTotals>;
  /** Totales en la moneda principal; con cotización incluye lo de la otra moneda convertido */
  main: CurrencyTotals & { converted: boolean };
  /** Gastos por categoría en la moneda principal, de mayor a menor */
  byCategory: CategoryRow[];
  /** Ingresos por categoría en la moneda principal */
  incomeByCategory: CategoryRow[];
  /** Cuotas que ya están comprometidas para el mes siguiente, en la moneda principal */
  nextMonthCommitted: number;
  /** Lo que se pasó a cuentas de ahorro en el mes (neto), en la moneda principal */
  saved: number;
  /** Categorías con tope que llegaron al 80 % o más */
  alerts: CategoryRow[];
}

const UNKNOWN: Category = { key: '?', name: 'Sin categoría', emoji: '🏷️', color: '#8a94a6', kind: 'gasto', budget: null, archived: true };

export function categoryOf(settings: Settings, key: string): Category {
  return settings.categories.find((c) => c.key === key) ?? { ...UNKNOWN, key };
}

export interface SummaryOptions {
  /** Para calcular las cuotas comprometidas del mes siguiente */
  nextMonth?: string;
  /** Pesos por dólar: si está, todo se suma en la moneda principal */
  rate?: number | null;
}

export function monthSummary(movements: Movement[], month: string, settings: Settings, opts: SummaryOptions = {}): MonthSummary {
  const main = settings.currency;
  const rate = opts.rate ?? null;
  const toMain = (cents: number, cur: Currency) => convert(cents, cur, main, rate);

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
  const mainTotals = { gastos: 0, ingresos: 0, balance: 0, converted: false };
  const cats = new Map<string, { total: number; count: number; kind: string }>();
  const accounts = new Map(settings.accounts.map((a) => [a.key, a]));
  let saved = 0;

  for (const l of lines) {
    const m = l.movement;
    if (m.kind === 'transferencia') {
      // Ahorro: lo que entra a una cuenta de ahorro desde otra que no lo es (y al revés, resta)
      const from = m.accountKey ? accounts.get(m.accountKey) : undefined;
      const to = m.toAccountKey ? accounts.get(m.toAccountKey) : undefined;
      if (to?.savings && !from?.savings && from) saved += toMain(m.toAmount ?? m.amount, to.currency) ?? 0;
      else if (from?.savings && !to?.savings && to) saved -= toMain(m.amount, from.currency) ?? 0;
      continue;
    }
    const t = totals[m.currency];
    if (m.kind === 'gasto') t.gastos += l.amount;
    else t.ingresos += l.amount;
    const inMain = toMain(l.amount, m.currency);
    if (inMain === null) continue;
    if (m.currency !== main) mainTotals.converted = true;
    if (m.kind === 'gasto') mainTotals.gastos += inMain;
    else mainTotals.ingresos += inMain;
    const c = cats.get(m.categoryKey) ?? { total: 0, count: 0, kind: m.kind };
    c.total += inMain;
    c.count += 1;
    cats.set(m.categoryKey, c);
  }
  for (const t of Object.values(totals)) t.balance = t.ingresos - t.gastos;
  mainTotals.balance = mainTotals.ingresos - mainTotals.gastos;

  const rows = (kind: 'gasto' | 'ingreso'): CategoryRow[] => {
    const out: CategoryRow[] = [];
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
  if (opts.nextMonth) {
    for (const m of movements) {
      if (m.installments > 1 && m.kind === 'gasto' && monthOf(m.date) < opts.nextMonth) {
        const l = lineForMonth(m, opts.nextMonth);
        if (l) nextMonthCommitted += toMain(l.amount, m.currency) ?? 0;
      }
    }
  }

  const byCategory = rows('gasto');
  return {
    month,
    lines,
    totals,
    main: mainTotals,
    byCategory,
    incomeByCategory: rows('ingreso'),
    nextMonthCommitted,
    saved,
    alerts: byCategory.filter((r) => r.ratio !== null && r.ratio >= 0.8),
  };
}

/** Gastos e ingresos por mes (moneda principal, convirtiendo si hay cotización) para los últimos n meses. */
export function monthlyTrend(movements: Movement[], month: string, n: number, currency: Currency, rate: number | null = null) {
  const out: { month: string; gastos: number; ingresos: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const mm = addMonths(month, -i);
    let gastos = 0;
    let ingresos = 0;
    for (const m of movements) {
      if (m.kind === 'transferencia') continue;
      const l = lineForMonth(m, mm);
      if (!l) continue;
      const v = convert(l.amount, m.currency, currency, rate);
      if (v === null) continue;
      if (m.kind === 'gasto') gastos += v;
      else ingresos += v;
    }
    out.push({ month: mm, gastos, ingresos });
  }
  return out;
}

/** Fijos activos que todavía no se cargaron en ese mes, ordenados por día. */
export function pendingRecurring(settings: Settings, movements: Movement[], month: string): Recurring[] {
  const done = new Set(movements.filter((m) => m.recurringKey && monthOf(m.date) === month).map((m) => m.recurringKey));
  return settings.recurring.filter((r) => r.active && !done.has(r.key)).sort((a, b) => a.day - b.day);
}

/** Fecha de un fijo en un mes (si el mes tiene menos días, el último). */
export function recurringDate(r: Recurring, month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(Math.min(r.day, last)).padStart(2, '0')}`;
}
