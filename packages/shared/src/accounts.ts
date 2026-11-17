import { monthDiff, monthOf } from './dates';
import type { Currency } from './money';
import { installmentAmount, type Movement } from './movement';
import type { Account, Settings } from './settings';

/**
 * Cuánto mueve un movimiento en el saldo de sus cuentas hasta `today`.
 * - Gastos con crédito en cuotas: la tarjeta se paga desde la cuenta elegida, así que
 *   descuentan solo las cuotas de los meses que ya llegaron.
 * - Movimientos con fecha futura todavía no cuentan.
 */
export function balanceEffects(m: Movement, today: string): { key: string | null; currency: Currency; amount: number }[] {
  if (m.date > today) return [];
  if (m.kind === 'ingreso') return [{ key: m.accountKey, currency: m.currency, amount: m.amount }];
  if (m.kind === 'transferencia') {
    return [
      { key: m.accountKey, currency: m.currency, amount: -m.amount },
      { key: m.toAccountKey, currency: m.currency, amount: m.toAmount ?? m.amount },
    ];
  }
  const paid = Math.min(m.installments, monthDiff(monthOf(m.date), monthOf(today)) + 1);
  let total = 0;
  for (let n = 1; n <= paid; n++) total += installmentAmount(m.amount, m.installments, n);
  return [{ key: m.accountKey, currency: m.currency, amount: -total }];
}

export interface AccountBalance {
  account: Account;
  /** Saldo hoy, en la moneda de la cuenta (centavos) */
  balance: number;
  /** Cuotas de tarjeta cargadas a esta cuenta que todavía no llegaron */
  pendingInstallments: number;
}

export interface Balances {
  accounts: AccountBalance[];
  /** Total por moneda de las cuentas activas */
  totals: Record<Currency, number>;
  /** Lo que mueven los movimientos sin cuenta asignada (los cargados antes de que existieran las cuentas) */
  unassigned: Record<Currency, number>;
  unassignedCount: number;
}

export function accountBalances(movements: Movement[], settings: Settings, today: string): Balances {
  const sums = new Map<string, number>();
  const pending = new Map<string, number>();
  const unassigned: Record<Currency, number> = { ARS: 0, USD: 0 };
  let unassignedCount = 0;
  const known = new Set(settings.accounts.map((a) => a.key));

  for (const m of movements) {
    let counted = false;
    for (const e of balanceEffects(m, today)) {
      if (e.key && known.has(e.key)) {
        sums.set(e.key, (sums.get(e.key) ?? 0) + e.amount);
      } else {
        unassigned[e.currency] += e.amount;
        counted = true;
      }
    }
    if (counted) unassignedCount += 1;
    if (m.kind === 'gasto' && m.installments > 1 && m.accountKey) {
      const paidOrNot = balanceEffects(m, today)[0]?.amount ?? 0;
      const left = m.amount + paidOrNot; // paidOrNot es negativo
      if (left > 0) pending.set(m.accountKey, (pending.get(m.accountKey) ?? 0) + left);
    }
  }

  const totals: Record<Currency, number> = { ARS: 0, USD: 0 };
  const accounts = settings.accounts.map((account) => {
    const balance = account.initialBalance + (sums.get(account.key) ?? 0);
    if (!account.archived) totals[account.currency] += balance;
    return { account, balance, pendingInstallments: pending.get(account.key) ?? 0 };
  });
  return { accounts, totals, unassigned, unassignedCount };
}

export function accountOf(settings: Settings, key: string | null): Account | null {
  return key ? (settings.accounts.find((a) => a.key === key) ?? null) : null;
}
