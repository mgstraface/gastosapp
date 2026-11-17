import { z } from 'zod';
import { currencySchema } from './money';

export const kindSchema = z.enum(['gasto', 'ingreso']);
export type Kind = z.infer<typeof kindSchema>;

export const categorySchema = z.object({
  /** Identificador estable: los movimientos guardan esto, así renombrar no rompe nada. */
  key: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1, 'La categoría necesita un nombre').max(30),
  emoji: z.string().max(8).default('🏷️'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8a94a6'),
  kind: kindSchema.default('gasto'),
  /** Presupuesto mensual en centavos, en la moneda principal. null = sin tope. */
  budget: z.number().int().positive().max(1e13).nullable().default(null),
  /** Oculta para cargar nuevos movimientos, pero los viejos la siguen mostrando. */
  archived: z.boolean().default(false),
});
export type Category = z.infer<typeof categorySchema>;

export const accountSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1, 'La cuenta necesita un nombre').max(30),
  emoji: z.string().max(8).default('💵'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3d8b7d'),
  currency: currencySchema.default('ARS'),
  /** Saldo antes del primer movimiento cargado (centavos, puede ser negativo). Se ajusta desde "Saldo hoy". */
  initialBalance: z.number().int().min(-1e13).max(1e13).default(0),
  /** normal: plata que tenés. tarjeta: tarjeta de crédito, el saldo es lo que debés. */
  type: z.enum(['normal', 'tarjeta']).default('normal'),
  /** Cuenta de ahorro: lo que pasás acá cuenta en "Ahorraste este mes". */
  savings: z.boolean().default(false),
  archived: z.boolean().default(false),
});
export type Account = z.infer<typeof accountSchema>;

export const DEFAULT_ACCOUNTS: Account[] = [
  { key: 'efectivo', name: 'Efectivo', emoji: '💵', color: '#7a9e4b', currency: 'ARS', initialBalance: 0, type: 'normal', savings: false, archived: false },
];

/** Gastos e ingresos que se repiten todos los meses (alquiler, servicios, suscripciones, sueldo). */
export const recurringSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,40}$/),
  kind: kindSchema.default('gasto'),
  description: z.string().trim().min(1, 'Ponele un nombre').max(60),
  /** Monto estimado en centavos (al confirmar se puede cambiar) */
  amount: z.number().int().positive().max(1e13),
  currency: currencySchema.default('ARS'),
  categoryKey: z.string().min(1).max(40),
  accountKey: z.string().max(40).nullable().default(null),
  method: z.enum(['efectivo', 'debito', 'credito', 'transferencia', 'otro']).default('debito'),
  /** Día del mes en que vence o se cobra */
  day: z.number().int().min(1).max(31).default(1),
  active: z.boolean().default(true),
});
export type Recurring = z.infer<typeof recurringSchema>;

/** Personas con las que se comparten gastos. */
export const personSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1, 'Ponele un nombre').max(30),
  emoji: z.string().max(8).default('🙂'),
});
export type Person = z.infer<typeof personSchema>;

export const dollarSourceSchema = z.enum(['blue', 'bolsa', 'oficial', 'tarjeta', 'manual']);
export type DollarSource = z.infer<typeof dollarSourceSchema>;
export const DOLLAR_LABELS: Record<DollarSource, string> = { blue: 'Blue', bolsa: 'MEP', oficial: 'Oficial', tarjeta: 'Tarjeta', manual: 'A mano' };

export const dollarSettingsSchema = z.object({
  /** Qué cotización usar para pasar dólares a pesos (o al revés). */
  source: dollarSourceSchema.default('bolsa'),
  /** Pesos por dólar, si source = manual */
  manualRate: z.number().positive().max(1e7).nullable().default(null),
});

export const settingsSchema = z
  .object({
    /** Moneda principal: la que se usa por defecto y para los presupuestos. */
    currency: currencySchema.default('ARS'),
    categories: z.array(categorySchema).min(1).max(80),
    /** Dónde está la plata. Los ajustes guardados antes de que existieran arrancan con "Efectivo". */
    accounts: z.array(accountSchema).max(40).default(() => DEFAULT_ACCOUNTS.map((a) => ({ ...a }))),
    recurring: z.array(recurringSchema).max(100).default([]),
    people: z.array(personSchema).max(40).default([]),
    dollar: dollarSettingsSchema.default({ source: 'bolsa', manualRate: null }),
    /** Avisar cuando una categoría llega al 80 % o se pasa del tope */
    budgetAlerts: z.boolean().default(true),
  })
  .refine((s) => new Set(s.categories.map((c) => c.key)).size === s.categories.length, {
    message: 'Hay dos categorías con el mismo identificador',
    path: ['categories'],
  })
  .refine((s) => new Set(s.accounts.map((a) => a.key)).size === s.accounts.length, {
    message: 'Hay dos cuentas con el mismo identificador',
    path: ['accounts'],
  });
export type Settings = z.infer<typeof settingsSchema>;

export const PALETTE = ['#e07a5f', '#3d8b7d', '#f2b134', '#5b7fc7', '#b5658f', '#7a9e4b', '#d9895b', '#6c6fb8', '#4aa3b8', '#a68a64', '#c25b56', '#8a94a6'];

export const DEFAULT_CATEGORIES: Category[] = [
  { key: 'super', name: 'Súper', emoji: '🛒', color: '#3d8b7d', kind: 'gasto', budget: null, archived: false },
  { key: 'comida', name: 'Comida afuera', emoji: '🍕', color: '#e07a5f', kind: 'gasto', budget: null, archived: false },
  { key: 'casa', name: 'Casa', emoji: '🏠', color: '#5b7fc7', kind: 'gasto', budget: null, archived: false },
  { key: 'servicios', name: 'Servicios', emoji: '💡', color: '#f2b134', kind: 'gasto', budget: null, archived: false },
  { key: 'transporte', name: 'Transporte', emoji: '🚗', color: '#6c6fb8', kind: 'gasto', budget: null, archived: false },
  { key: 'salud', name: 'Salud', emoji: '💊', color: '#4aa3b8', kind: 'gasto', budget: null, archived: false },
  { key: 'salidas', name: 'Salidas', emoji: '🎉', color: '#b5658f', kind: 'gasto', budget: null, archived: false },
  { key: 'suscripciones', name: 'Suscripciones', emoji: '📺', color: '#c25b56', kind: 'gasto', budget: null, archived: false },
  { key: 'ropa', name: 'Ropa', emoji: '👕', color: '#d9895b', kind: 'gasto', budget: null, archived: false },
  { key: 'mascotas', name: 'Mascotas', emoji: '🐾', color: '#a68a64', kind: 'gasto', budget: null, archived: false },
  { key: 'otros', name: 'Otros', emoji: '🏷️', color: '#8a94a6', kind: 'gasto', budget: null, archived: false },
  { key: 'sueldo', name: 'Sueldo', emoji: '💼', color: '#7a9e4b', kind: 'ingreso', budget: null, archived: false },
  { key: 'extra', name: 'Extras', emoji: '✨', color: '#3d8b7d', kind: 'ingreso', budget: null, archived: false },
];

export const defaultSettings = (): Settings => ({
  currency: 'ARS',
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
  recurring: [],
  people: [],
  dollar: { source: 'bolsa', manualRate: null },
  budgetAlerts: true,
});

/** "Comida afuera" → "comida-afuera", sin chocar con las que ya existen. Sirve también para cuentas. */
export function categoryKey(name: string, taken: string[]): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'cat';
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}-${i}`;
  return key;
}
