import { z } from 'zod';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido');

/** "YYYY-MM-DD" en la hora local del dispositivo. */
export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" de hoy en Argentina (para el servidor, que corre en UTC). */
export function todayAR(): string {
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
}

export const monthOf = (date: string) => date.slice(0, 7);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Cantidad de meses de a hasta b (b - a). */
export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number) as [number, number];
  const [yb, mb] = b.split('-').map(Number) as [number, number];
  return (yb - ya) * 12 + (mb - ma);
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-11" → "noviembre 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "2026-11-17" → "martes 17" */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d}`;
}

/** Días del mes (para el promedio diario). */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(y, m, 0).getDate();
}
