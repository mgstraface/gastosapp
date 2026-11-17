import { METHOD_LABELS, accountOf, categoryOf, formatMoney, type MonthLine } from '@gastosapp/shared';
import { useSettings } from '../lib/store';
import { useRegister } from '../features/movements/registerContext';

/** Una fila de movimiento tal como pesa en el mes (con cuotas, solo la cuota de ese mes). */
export function MovementRow({ line, accountView }: { line: MonthLine; /** Si se está mirando una cuenta: el signo de las transferencias depende de ella */ accountView?: string }) {
  const settings = useSettings();
  const open = useRegister();
  const m = line.movement;
  const acc = accountOf(settings, m.accountKey);

  if (m.kind === 'transferencia') {
    const to = accountOf(settings, m.toAccountKey);
    const incoming = accountView !== undefined && accountView === m.toAccountKey;
    const shown = incoming ? (m.toAmount ?? m.amount) : m.amount;
    const cur = incoming && to ? to.currency : m.currency;
    return (
      <button type="button" className="mov-row" onClick={() => open({ mode: 'edit', movement: m })}>
        <span className="mov-icon" aria-hidden="true">
          🔁
        </span>
        <span className="mov-text">
          <strong>{m.description || 'Transferencia'}</strong>
          <small>
            {acc ? `${acc.emoji} ${acc.name}` : 'Sin cuenta'} → {to ? `${to.emoji} ${to.name}` : 'Sin cuenta'}
          </small>
        </span>
        <span className={`mov-amount${accountView ? (incoming ? ' is-income' : '') : ' is-neutral'}`}>
          {accountView ? formatMoney(incoming ? shown : -shown, cur, { sign: incoming }) : formatMoney(shown, cur)}
          {m.toAmount && !accountView && <small>→ {formatMoney(m.toAmount, to?.currency ?? 'USD')}</small>}
        </span>
      </button>
    );
  }

  const cat = categoryOf(settings, m.categoryKey);
  const isIncome = m.kind === 'ingreso';
  const detail = [
    m.installments > 1 ? `Cuota ${line.installment}/${m.installments}` : null,
    acc ? `${acc.emoji} ${acc.name}` : 'Sin cuenta',
    m.kind === 'gasto' && m.method === 'credito' ? METHOD_LABELS.credito : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
