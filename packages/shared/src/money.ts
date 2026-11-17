import { z } from 'zod';

/** Monedas que maneja la app. Los totales se muestran por moneda, nunca se convierten solos. */
export const currencySchema = z.enum(['ARS', 'USD']);
export type Currency = z.infer<typeof currencySchema>;
export const CURRENCIES: Currency[] = ['ARS', 'USD'];

/**
 * Los montos se guardan en centavos (enteros) para no arrastrar errores de coma flotante.
 * Tope: 100 mil millones, de sobra para cualquier gasto personal.
 */
export const centsSchema = z.number().int().positive('El monto tiene que ser mayor a cero').max(1e13);

/** "12.345,67" / "12345.5" / "1.500" → centavos. null si no se entiende. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/\s|\$/g, '');
  if (!t) return null;
  let norm: string;
  if (t.includes(',')) {
    // formato argentino: punto de miles, coma decimal
    norm = t.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = t.split('.');
    // "1.500" o "1.500.000" son miles; "12.5" o "12.50" son decimales
    norm = parts.length > 2 || (parts.length === 2 && parts[1]!.length === 3) ? parts.join('') : t;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  const cents = Math.round(Number(norm) * 100);
  return cents > 0 ? cents : null;
}

/** Centavos → "$ 12.345,67" (sin decimales si son redondos). */
export function formatMoney(cents: number, currency: Currency = 'ARS', opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(cents) / 100;
  const decimals = Number.isInteger(abs) ? 0 : 2;
  const num = abs.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
  const prefix = currency === 'USD' ? 'US$ ' : '$ ';
  const sign = cents < 0 ? '−' : opts.sign && cents > 0 ? '+' : '';
  return `${sign}${prefix}${num}`;
}

/** Centavos → texto para el input ("12345,67"). */
export function amountToInput(cents: number): string {
  const v = cents / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
}
