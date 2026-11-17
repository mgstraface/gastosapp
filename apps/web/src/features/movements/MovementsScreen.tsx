import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { categoryOf, dayLabel, formatMoney, monthOf, monthSummary, type MonthLine } from '@gastosapp/shared';
import { MonthPicker, useMonth } from '../../components/MonthPicker';
import { MovementRow } from '../../components/MovementRow';
import { useSettings, useStore } from '../../lib/store';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function MovementsScreen() {
  const settings = useSettings();
  const movements = useStore((s) => s.movements);
  const [month, setMonth] = useMonth();
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'todo' | 'gasto' | 'ingreso'>('todo');

  const summary = useMemo(() => monthSummary(movements, month, settings), [movements, month, settings]);

  const lines = useMemo(() => {
    const q = fold(query.trim());
    return summary.lines.filter((l) => {
      const m = l.movement;
      if (cat && m.categoryKey !== cat) return false;
      if (kind !== 'todo' && m.kind !== kind) return false;
      if (q && !fold(`${m.description} ${categoryOf(settings, m.categoryKey).name}`).includes(q)) return false;
      return true;
    });
  }, [summary.lines, cat, kind, query, settings]);

  const groups = useMemo(() => {
    const out: { key: string; title: string; lines: MonthLine[] }[] = [];
    const older: MonthLine[] = [];
    for (const l of lines) {
      // Cuotas de compras de meses anteriores: van juntas al final
      if (monthOf(l.movement.date) !== month) {
        older.push(l);
        continue;
      }
      const last = out[out.length - 1];
      if (last && last.key === l.movement.date) last.lines.push(l);
      else out.push({ key: l.movement.date, title: dayLabel(l.movement.date), lines: [l] });
    }
    if (older.length) out.push({ key: 'cuotas', title: 'Cuotas de compras anteriores', lines: older });
    return out;
  }, [lines, month]);

  // Total de lo filtrado, en la moneda principal
  const total = lines.reduce((s, l) => (l.movement.currency === settings.currency ? s + (l.movement.kind === 'gasto' ? -l.amount : l.amount) : s), 0);
  const filterCat = cat ? categoryOf(settings, cat) : null;

  const clearCat = () => {
    const next = new URLSearchParams(params);
    next.delete('cat');
    setParams(next, { replace: true });
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Movimientos</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </header>

      <div className="filters">
        <input type="search" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar movimientos" />
        <div className="chips">
          {(['todo', 'gasto', 'ingreso'] as const).map((k) => (
            <button key={k} type="button" className={`chip-btn${kind === k ? ' is-on' : ''}`} onClick={() => setKind(k)}>
              {k === 'todo' ? 'Todo' : k === 'gasto' ? 'Gastos' : 'Ingresos'}
            </button>
          ))}
          {filterCat && (
            <button type="button" className="chip-btn is-on" onClick={clearCat}>
              {filterCat.emoji} {filterCat.name} ✕
            </button>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <p className="filter-total">
          {lines.length} {lines.length === 1 ? 'movimiento' : 'movimientos'} · <strong className={total < 0 ? 'neg' : ''}>{formatMoney(total, settings.currency, { sign: true })}</strong>
        </p>
      )}

      {groups.length === 0 ? (
        <div className="empty card">
          <p>{summary.lines.length ? 'Nada coincide con el filtro.' : 'No hay movimientos este mes.'}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="day-group">
            <h2 className="day-title">{g.title}</h2>
            <div className="mov-list card">
              {g.lines.map((l) => (
                <MovementRow key={l.movement.id} line={l} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
