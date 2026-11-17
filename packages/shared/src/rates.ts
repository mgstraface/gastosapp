import type { DollarSource, Settings } from './settings';

/** Cotizaciones del dólar (pesos por dólar) que devuelve la API. */
export interface DollarRates {
  rates: Partial<Record<Exclude<DollarSource, 'manual'>, { compra: number | null; venta: number | null }>>;
  updatedAt: string | null;
}

/** Cotización a usar según los ajustes: la de venta (lo que cuesta comprar un dólar). */
export function rateFor(settings: Settings, rates: DollarRates | null): number | null {
  const d = settings.dollar;
  if (d.source === 'manual') return d.manualRate;
  const r = rates?.rates[d.source];
  return r?.venta ?? r?.compra ?? null;
}
