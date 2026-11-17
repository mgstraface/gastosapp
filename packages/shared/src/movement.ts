import { z } from 'zod';
import { addMonths, dateSchema, monthDiff, monthOf } from './dates';
import { centsSchema, currencySchema } from './money';

export const methodSchema = z.enum(['efectivo', 'debito', 'credito', 'transferencia', 'otro']);
export type Method = z.infer<typeof methodSchema>;

export const METHOD_LABELS: Record<Method, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

/** Gasto o ingreso cuentan en el mes; una transferencia solo mueve plata entre cuentas. */
export const movementKindSchema = z.enum(['gasto', 'ingreso', 'transferencia']);
export type MovementKind = z.infer<typeof movementKindSchema>;

export const splitSchema = z.object({
  personKey: z.string().min(1).max(40),
  /** Mi parte del gasto, en centavos */
  myPart: z.number().int().min(0).max(1e13),
  /** me: pagué yo todo (la otra persona me debe su parte). them: pagó la otra persona (le debo mi parte). */
  paidBy: z.enum(['me', 'them']).default('me'),
});
export type Split = z.infer<typeof splitSchema>;

export const movementInputSchema = z
  .object({
    kind: movementKindSchema.default('gasto'),
    /** Monto TOTAL en centavos. Si es en cuotas, cada mes cuenta amount / installments. */
    amount: centsSchema,
    currency: currencySchema.default('ARS'),
    /** Vacío en las transferencias */
    categoryKey: z.string().max(40).default(''),
    /** Cuenta de donde sale (gasto, transferencia) o a donde entra (ingreso). null = sin asignar (movimientos viejos). */
    accountKey: z.string().max(40).nullable().default(null),
    /** Transferencias: cuenta destino */
    toAccountKey: z.string().max(40).nullable().default(null),
    /** Transferencias entre monedas distintas (comprar o vender dólares): lo que entra en la cuenta destino */
    toAmount: centsSchema.nullable().default(null),
    date: dateSchema,
    description: z.string().trim().max(120).default(''),
    method: methodSchema.default('debito'),
    /** Cuotas: solo para gastos con crédito. 1 = un solo pago. */
    installments: z.number().int().min(1).max(60).default(1),
    /** Si salió de un gasto fijo: cuál (para saber que ese mes ya está pagado) */
    recurringKey: z.string().max(40).nullable().default(null),
    /** Gasto compartido: con quién, cuál es mi parte y quién pagó */
    split: splitSchema.nullable().default(null),
    /** Transferencia con una persona (saldar un compartido): del otro lado no hay cuenta, hay una persona */
    personKey: z.string().max(40).nullable().default(null),
  })
  .superRefine((m, ctx) => {
    if (m.kind === 'transferencia') {
      if (m.personKey) {
        // Con una persona: de un lado hay una cuenta mía, del otro la persona
        if (!m.accountKey === !m.toAccountKey) ctx.addIssue({ code: 'custom', message: 'Elegí la cuenta de donde sale o a donde entra', path: ['accountKey'] });
      } else if (!m.accountKey || !m.toAccountKey) {
        ctx.addIssue({ code: 'custom', message: 'Elegí de qué cuenta sale y a cuál entra', path: ['toAccountKey'] });
      } else if (m.accountKey === m.toAccountKey) {
        ctx.addIssue({ code: 'custom', message: 'La cuenta de origen y la de destino son la misma', path: ['toAccountKey'] });
      }
    } else if (!m.categoryKey) {
      ctx.addIssue({ code: 'custom', message: 'Elegí una categoría', path: ['categoryKey'] });
    }
    if (m.split && m.split.myPart > m.amount) ctx.addIssue({ code: 'custom', message: 'Tu parte no puede ser más que el total', path: ['split'] });
  })
  .transform((m) => ({
    ...m,
    installments: m.kind === 'gasto' && m.method === 'credito' ? m.installments : 1,
    categoryKey: m.kind === 'transferencia' ? '' : m.categoryKey,
    toAccountKey: m.kind === 'transferencia' ? m.toAccountKey : null,
    toAmount: m.kind === 'transferencia' && !m.personKey ? m.toAmount : null,
    split: m.kind === 'gasto' ? m.split : null,
    personKey: m.kind === 'transferencia' ? m.personKey : null,
    method: m.kind === 'transferencia' ? ('transferencia' as const) : m.method,
  }));
export type MovementInput = z.input<typeof movementInputSchema>;

export interface Movement {
  id: string;
  kind: MovementKind;
  amount: number;
  currency: 'ARS' | 'USD';
  categoryKey: string;
  accountKey: string | null;
  toAccountKey: string | null;
  toAmount: number | null;
  date: string;
  description: string;
  method: Method;
  installments: number;
  recurringKey: string | null;
  split: Split | null;
  personKey: string | null;
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

/** Con un gasto compartido, en el mes cuenta solo mi parte (proporcional en cada cuota). */
export function lineForMonth(m: Movement, month: string): MonthLine | null {
  const n = monthDiff(monthOf(m.date), month) + 1;
  if (n < 1 || n > m.installments) return null;
  const cuota = installmentAmount(m.amount, m.installments, n);
  const amount = m.split && m.amount > 0 ? Math.round((cuota * m.split.myPart) / m.amount) : cuota;
  return { movement: m, amount, installment: n };
}

export const lastMonthOf = (m: Pick<Movement, 'date' | 'installments'>) => addMonths(monthOf(m.date), m.installments - 1);
