import { z } from 'zod';
import { addMonths, dateSchema, monthDiff, monthOf } from './dates';
import { centsSchema, currencySchema } from './money';
import { kindSchema } from './settings';

export const methodSchema = z.enum(['efectivo', 'debito', 'credito', 'transferencia', 'otro']);
export type Method = z.infer<typeof methodSchema>;

export const METHOD_LABELS: Record<Method, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

export const movementInputSchema = z
  .object({
    kind: kindSchema.default('gasto'),
    /** Monto TOTAL en centavos. Si es en cuotas, cada mes cuenta amount / installments. */
    amount: centsSchema,
    currency: currencySchema.default('ARS'),
    categoryKey: z.string().min(1).max(40),
    date: dateSchema,
    description: z.string().trim().max(120).default(''),
    method: methodSchema.default('debito'),
    /** Cuotas: solo para gastos con crédito. 1 = un solo pago. */
    installments: z.number().int().min(1).max(60).default(1),
  })
  .transform((m) => ({ ...m, installments: m.kind === 'gasto' && m.method === 'credito' ? m.installments : 1 }));
export type MovementInput = z.input<typeof movementInputSchema>;

export interface Movement {
  id: string;
  kind: 'gasto' | 'ingreso';
  amount: number;
  currency: 'ARS' | 'USD';
  categoryKey: string;
  date: string;
  description: string;
  method: Method;
  installments: number;
  createdAt: string;
}

/** Lo que pesa un movimiento en un mes dado (con cuotas, solo la cuota de ese mes). */
export interface MonthLine {
  movement: Movement;
  /** Centavos que cuenta en este mes */
  amount: number;
  /** Número de cuota (1..installments); 1 si es un solo pago */
  installment: number;
}

/** Monto de cada cuota; la última absorbe el redondeo para que la suma dé exacto. */
export function installmentAmount(total: number, installments: number, n: number): number {
  const base = Math.floor(total / installments);
  return n === installments ? total - base * (installments - 1) : base;
}

export function lineForMonth(m: Movement, month: string): MonthLine | null {
  const n = monthDiff(monthOf(m.date), month) + 1;
  if (n < 1 || n > m.installments) return null;
  return { movement: m, amount: installmentAmount(m.amount, m.installments, n), installment: n };
}

export const lastMonthOf = (m: Pick<Movement, 'date' | 'installments'>) => addMonths(monthOf(m.date), m.installments - 1);
