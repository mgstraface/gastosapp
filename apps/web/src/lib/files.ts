import { METHOD_LABELS, categoryOf, type Movement, type Settings } from '@gastosapp/shared';

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV con punto y coma y coma decimal: abre directo en Excel/Sheets configurados en español. */
export function movementsCsv(movements: Movement[], settings: Settings): string {
  const head = ['Fecha', 'Tipo', 'Categoría', 'Detalle', 'Monto', 'Moneda', 'Medio de pago', 'Cuotas'];
  const rows = [...movements]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => [
      m.date,
      m.kind === 'gasto' ? 'Gasto' : 'Ingreso',
      categoryOf(settings, m.categoryKey).name,
      m.description,
      ((m.kind === 'gasto' ? -m.amount : m.amount) / 100).toFixed(2).replace('.', ','),
      m.currency,
      METHOD_LABELS[m.method],
      m.installments,
    ]);
  // BOM para que Excel lea bien los acentos
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
}
