import { METHOD_LABELS, categoryOf, formatMoney, type MonthLine } from '@gastosapp/shared';
import { useSettings } from '../lib/store';
import { useRegister } from '../features/movements/registerContext';

/** Una fila de movimiento tal como pesa en el mes (con cuotas, solo la cuota de ese mes). */
export function MovementRow({ line }: { line: MonthLine }) {
  const settings = useSettings();
  const open = useRegister();
  const m = line.movement;
  const cat = categoryOf(settings, m.categoryKey);
  const isIncome = m.kind === 'ingreso';
  const detail = [m.installments > 1 ? `Cuota ${line.installment}/${m.installments}` : null, METHOD_LABELS[m.method]].filter(Boolean).join(' · ');

  return (
    <button type="button" className="mov-row" onClick={() => open({ mode: 'edit', movement: m })}>
      <span className="mov-icon" style={{ background: `${cat.color}22`, color: cat.color }} aria-hidden="true">
        {cat.emoji}
      </span>
      <span className="mov-text">
        <strong>{m.description || cat.name}</strong>
        <small>
          {m.description ? `${cat.name} · ` : ''}
          {detail}
        </small>
      </span>
      <span className={`mov-amount${isIncome ? ' is-income' : ''}`}>
        {formatMoney(isIncome ? line.amount : -line.amount, m.currency, { sign: isIncome })}
        {m.installments > 1 && <small>de {formatMoney(m.amount, m.currency)}</small>}
      </span>
    </button>
  );
}
