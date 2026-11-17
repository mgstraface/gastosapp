import { METHOD_LABELS, accountOf, categoryOf, type Movement, type Settings } from '@gastosapp/shared';

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
  const head = ['Fecha', 'Tipo', 'Categoría', 'Detalle', 'Monto', 'Moneda', 'Cuenta', 'Cuenta destino', 'Monto destino', 'Medio de pago', 'Cuotas', 'Compartido con', 'Mi parte', 'Pagó'];
  const rows = [...movements]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => [
      m.date,
      m.kind === 'gasto' ? 'Gasto' : m.kind === 'ingreso' ? 'Ingreso' : 'Transferencia',
      m.kind === 'transferencia' ? '' : categoryOf(settings, m.categoryKey).name,
      m.description,
      ((m.kind === 'ingreso' ? m.amount : -m.amount) / 100).toFixed(2).replace('.', ','),
      m.currency,
      accountOf(settings, m.accountKey)?.name ?? '',
      accountOf(settings, m.toAccountKey)?.name ?? '',
      m.toAmount ? (m.toAmount / 100).toFixed(2).replace('.', ',') : '',
      METHOD_LABELS[m.method],
      m.installments,
      settings.people.find((p) => p.key === (m.split?.personKey ?? m.personKey))?.name ?? '',
      m.split ? (m.split.myPart / 100).toFixed(2).replace('.', ',') : '',
      m.split ? (m.split.paidBy === 'me' ? 'Yo' : 'La otra persona') : '',
    ]);
  // BOM para que Excel lea bien los acentos
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
}
