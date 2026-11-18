import { addMonths, monthDiff, monthOf } from './dates';
import type { Currency } from './money';
import { installmentAmount, lineForMonth, type Movement } from './movement';
import type { Account, Settings } from './settings';

/**
 * Cuánto mueve un movimiento en el saldo de sus cuentas hasta `today`.
 * - Gastos en cuotas: descuentan solo las cuotas de los meses que ya llegaron (de la tarjeta
 *   si se cargaron en una cuenta tarjeta, o de la cuenta desde donde se paga).
 * - Gastos compartidos que pagó la otra persona no tocan mis cuentas.
 * - Movimientos con fecha futura todavía no cuentan.
 */
export function balanceEffects(m: Movement, today: string): { key: string | null; currency: Currency; amount: number }[] {
  if (m.date > today) return [];
  if (m.kind === 'ingreso') return [{ key: m.accountKey, currency: m.currency, amount: m.amount }];
  if (m.kind === 'transferencia') {
    const out: { key: string | null; currency: Currency; amount: number }[] = [];
    if (m.accountKey || !m.personKey) out.push({ key: m.accountKey, currency: m.currency, amount: -m.amount });
    if (m.toAccountKey || !m.personKey) out.push({ key: m.toAccountKey, currency: m.currency, amount: m.toAmount ?? m.amount });
    return out;
  }
  if (m.split?.paidBy === 'them') return [];
  const paid = Math.min(m.installments, monthDiff(monthOf(m.date), monthOf(today)) + 1);
  let total = 0;
  for (let n = 1; n <= paid; n++) total += installmentAmount(m.amount, m.installments, n);
  return [{ key: m.accountKey, currency: m.currency, amount: -total }];
}

export interface AccountBalance {
  account: Account;
  /** Saldo hoy, en la moneda de la cuenta (centavos). En una tarjeta es negativo: lo que debés. */
  balance: number;
  /** Cuotas cargadas a esta cuenta que todavía no llegaron */
  pendingInstallments: number;
  /** Tarjetas: lo que entra en el resumen del mes que viene */
  dueNextMonth: number;
}

export interface Balances {
  accounts: AccountBalance[];
  /** Plata que tenés: total por moneda de las cuentas activas (sin las tarjetas) */
  totals: Record<Currency, number>;
  /** Lo que se debe en tarjetas (positivo), por moneda. No se resta de totals hasta que se paga. */
  cardDebt: Record<Currency, number>;
  /** Lo que mueven los movimientos sin cuenta asignada (los cargados antes de que existieran las cuentas) */
  unassigned: Record<Currency, number>;
  unassignedCount: number;
}

export function accountBalances(movements: Movement[], settings: Settings, today: string): Balances {
  const sums = new Map<string, number>();
  const pending = new Map<string, number>();
  const nextDue = new Map<string, number>();
  const unassigned: Record<Currency, number> = { ARS: 0, USD: 0 };
  let unassignedCount = 0;
  const known = new Set(settings.accounts.map((a) => a.key));
  const nextMonth = addMonths(monthOf(today), 1);

  for (const m of movements) {
    let counted = false;
    const effects = balanceEffects(m, today);
    for (const e of effects) {
      if (e.key && known.has(e.key)) {
        sums.set(e.key, (sums.get(e.key) ?? 0) + e.amount);
      } else {
        unassigned[e.currency] += e.amount;
        counted = true;
      }
    }
    if (counted) unassignedCount += 1;
    if (m.kind === 'gasto' && m.accountKey && m.split?.paidBy !== 'them') {
      if (m.installments > 1) {
        const left = m.amount + (effects[0]?.amount ?? 0); // effects es negativo
        if (left > 0) pending.set(m.accountKey, (pending.get(m.accountKey) ?? 0) + left);
      }
      // El resumen que viene: la cuota completa (aunque sea compartido, la tarjeta cobra todo)
      const n = monthDiff(monthOf(m.date), nextMonth) + 1;
      if (n >= 1 && n <= m.installments) nextDue.set(m.accountKey, (nextDue.get(m.accountKey) ?? 0) + installmentAmount(m.amount, m.installments, n));
    }
  }

  // Tarjetas: cuotas de compras anteriores cargadas a mano
  const thisMonth = monthOf(today);
  for (const a of settings.accounts) {
    for (const u of a.upcoming ?? []) {
      if (u.month <= thisMonth) sums.set(a.key, (sums.get(a.key) ?? 0) - u.amount);
      else pending.set(a.key, (pending.get(a.key) ?? 0) + u.amount);
      if (u.month === nextMonth) nextDue.set(a.key, (nextDue.get(a.key) ?? 0) + u.amount);
    }
  }

  const totals: Record<Currency, number> = { ARS: 0, USD: 0 };
  const cardDebt: Record<Currency, number> = { ARS: 0, USD: 0 };
  const accounts = settings.accounts.map((account) => {
    const balance = account.initialBalance + (sums.get(account.key) ?? 0);
    if (!account.archived) {
      if (account.type === 'tarjeta') cardDebt[account.currency] += Math.max(0, -balance);
      else totals[account.currency] += balance;
    }
    return { account, balance, pendingInstallments: pending.get(account.key) ?? 0, dueNextMonth: nextDue.get(account.key) ?? 0 };
  });
  return { accounts, totals, cardDebt, unassigned, unassignedCount };
}

export function accountOf(settings: Settings, key: string | null): Account | null {
  return key ? (settings.accounts.find((a) => a.key === key) ?? null) : null;
}

/* ---------- gastos compartidos ---------- */

export interface PersonBalance {
  key: string;
  /** Positivo: esa persona te debe. Negativo: le debés. Por moneda, en centavos. */
  balance: Record<Currency, number>;
  count: number;
}

export function personBalances(movements: Movement[], settings: Settings): PersonBalance[] {
  const map = new Map<string, PersonBalance>();
  const get = (key: string) => {
    let p = map.get(key);
    if (!p) map.set(key, (p = { key, balance: { ARS: 0, USD: 0 }, count: 0 }));
    return p;
  };
  for (const s of settings.people) get(s.key);
  for (const m of movements) {
    if (m.kind === 'gasto' && m.split) {
      const p = get(m.split.personKey);
      p.balance[m.currency] += m.split.paidBy === 'me' ? m.amount - m.split.myPart : -m.split.myPart;
      p.count += 1;
    } else if (m.kind === 'transferencia' && m.personKey) {
      const p = get(m.personKey);
      // Le pagué (sale de mi cuenta) → me debe más / le debo menos. Me pagó → al revés.
      p.balance[m.currency] += m.accountKey ? m.amount : -m.amount;
      p.count += 1;
    }
  }
  return [...map.values()];
}

/** Lo que cuenta un gasto en el mes para el resumen: helper para las cuotas que vienen. */
export const monthLineAmount = (m: Movement, month: string) => lineForMonth(m, month)?.amount ?? 0;
