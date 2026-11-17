import { useSearchParams } from 'react-router-dom';
import { addMonths, localDate, monthLabel, monthOf, monthSchema } from '@gastosapp/shared';

/** Mes elegido en la URL (?mes=2026-11); por defecto, el actual. */
export function useMonth(): [string, (m: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('mes');
  const current = monthOf(localDate());
  const month = raw && monthSchema.safeParse(raw).success ? raw : current;
  const setMonth = (m: string) => {
    const next = new URLSearchParams(params);
    if (m === current) next.delete('mes');
    else next.set('mes', m);
    setParams(next, { replace: true });
  };
  return [month, setMonth];
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const current = monthOf(localDate());
  return (
    <div className="month-picker">
      <button type="button" className="month-arrow" onClick={() => onChange(addMonths(month, -1))} aria-label="Mes anterior">
        ‹
      </button>
      <button type="button" className="month-name" onClick={() => onChange(current)} disabled={month === current}>
        {monthLabel(month)}
      </button>
      <button type="button" className="month-arrow" onClick={() => onChange(addMonths(month, 1))} aria-label="Mes siguiente">
        ›
      </button>
    </div>
  );
}
