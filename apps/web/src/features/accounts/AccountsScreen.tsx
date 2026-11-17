import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CURRENCIES, PALETTE, accountBalances, amountToInput, categoryKey, convert, formatMoney, localDate, parseAmount, type Account, type AccountBalance, type Currency } from '@gastosapp/shared';
import { Sheet } from '../../components/Sheet';
import { errorText } from '../../lib/api';
import { useRate, useSettings, useStore } from '../../lib/store';
import { useRegister } from '../movements/registerContext';

const EMOJIS = ['💵', '🏦', '💳', '🟦', '🟧', '📱', '🐷', '💰', '🪙', '📈', '🏠', '✈️', '🎯', '🧾'];

type Edit = { mode: 'new' } | { mode: 'edit'; row: AccountBalance };

export function AccountsScreen() {
  const settings = useSettings();
  const movements = useStore((s) => s.movements);
  const open = useRegister();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const rate = useRate();
  const b = useMemo(() => accountBalances(movements, settings, localDate()), [movements, settings]);
  const active = b.accounts.filter((r) => !r.account.archived && r.account.type === 'normal');
  const cards = b.accounts.filter((r) => !r.account.archived && r.account.type === 'tarjeta');
  const usdInArs = convert(b.totals.USD, 'USD', 'ARS', rate);
  const archived = b.accounts.filter((r) => r.account.archived);
  const hasUsd = active.some((r) => r.account.currency === 'USD');

  return (
    <div className="page">
      <header className="page-head">
        <h1>Cuentas</h1>
        <p className="eyebrow">Dónde está la plata hoy</p>
      </header>

      <section className="hero">
        <p className="hero-label">Total</p>
        <p className="hero-amount">{formatMoney(b.totals.ARS, 'ARS')}</p>
        {hasUsd && <p className="hero-sub">+ {formatMoney(b.totals.USD, 'USD')}</p>}
        {hasUsd && usdInArs !== null && rate && (
          <p className="hero-label">
            Todo en pesos: {formatMoney(b.totals.ARS + usdInArs, 'ARS')} · dólar a {formatMoney(Math.round(rate * 100), 'ARS')}
          </p>
        )}
        {cards.some((r) => r.balance < 0) && <p className="hero-label">Ya descuenta lo que debés en tarjetas.</p>}
      </section>

      <section className="card">
        <ul className="plain-list">
          {active.map((r) => (
            <li key={r.account.key}>
              <button type="button" className="cat-line" onClick={() => setEdit({ mode: 'edit', row: r })}>
                <span className="mov-icon" style={{ background: `${r.account.color}22` }} aria-hidden="true">
                  {r.account.emoji}
                </span>
                <span className="mov-text">
                  <strong>
                    {r.account.name}
                    {r.account.savings && <span className="badge">ahorro</span>}
                  </strong>
                  {r.pendingInstallments > 0 && <small>Cuotas por venir: {formatMoney(r.pendingInstallments, r.account.currency)}</small>}
                </span>
                <span className={`mov-amount${r.balance < 0 ? ' neg' : ''}`}>{formatMoney(r.balance, r.account.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="row-actions">
          <button type="button" className="btn-quiet" onClick={() => open({ mode: 'new', kind: 'transferencia' })} disabled={active.length < 2}>
            🔁 Transferir
          </button>
          <button type="button" className="btn-quiet" onClick={() => setEdit({ mode: 'new' })}>
            + Nueva cuenta
          </button>
        </div>
      </section>

      {cards.length > 0 && (
        <section className="card">
          <h2>Tarjetas de crédito</h2>
          <ul className="plain-list">
            {cards.map((r) => {
              const debt = -r.balance;
              return (
                <li key={r.account.key} className="card-row">
                  <button type="button" className="cat-line" onClick={() => setEdit({ mode: 'edit', row: r })}>
                    <span className="mov-icon" style={{ background: `${r.account.color}22` }} aria-hidden="true">
                      {r.account.emoji}
                    </span>
                    <span className="mov-text">
                      <strong>{r.account.name}</strong>
                      <small>
                        Próximo mes: {formatMoney(r.dueNextMonth, r.account.currency)}
                        {r.pendingInstallments > 0 ? ` · cuotas por venir ${formatMoney(r.pendingInstallments, r.account.currency)}` : ''}
                      </small>
                    </span>
                    <span className={`mov-amount${debt > 0 ? ' neg' : ''}`}>
                      {debt > 0 ? formatMoney(debt, r.account.currency) : debt < 0 ? `a favor ${formatMoney(-debt, r.account.currency)}` : 'Al día'}
                      {debt > 0 && <small>a pagar</small>}
                    </span>
                  </button>
                  {debt > 0 && (
                    <button
                      type="button"
                      className="btn-quiet small"
                      onClick={() =>
                        open({
                          mode: 'new',
                          prefill: {
                            kind: 'transferencia',
                            amount: debt,
                            toAccountKey: r.account.key,
                            accountKey: active.find((a) => a.account.currency === r.account.currency)?.account.key ?? null,
                            description: `Pago ${r.account.name}`,
                          },
                        })
                      }
                    >
                      Pagar {r.account.name}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="hint">Lo que comprás con la tarjeta suma a "a pagar" cuota por cuota, a medida que llega cada mes. Al pagar el resumen, cargalo como transferencia a la tarjeta.</p>
        </section>
      )}

      {b.unassignedCount > 0 && (
        <div className="notice">
          <p>
            <strong>
              {b.unassignedCount} {b.unassignedCount === 1 ? 'movimiento' : 'movimientos'} sin cuenta
            </strong>{' '}
            ({formatMoney(b.unassigned.ARS, 'ARS', { sign: true })}
            {b.unassigned.USD ? ` · ${formatMoney(b.unassigned.USD, 'USD', { sign: true })}` : ''}). Son de antes de las cuentas: abrilos y elegí de dónde salió la plata, o
            borralos si los usabas para anotar un saldo (el saldo ahora se pone en cada cuenta).
          </p>
          <Link to="/movimientos?cuenta=ninguna" className="link">
            Ver movimientos sin cuenta
          </Link>
        </div>
      )}

      {archived.length > 0 && (
        <section className="card">
          <button type="button" className="link" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Ocultar archivadas' : `Ver archivadas (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="plain-list">
              {archived.map((r) => (
                <li key={r.account.key}>
                  <button type="button" className="cat-line is-archived" onClick={() => setEdit({ mode: 'edit', row: r })}>
                    <span className="mov-icon" aria-hidden="true">
                      {r.account.emoji}
                    </span>
                    <span className="mov-text">
                      <strong>{r.account.name}</strong>
                      <small>Archivada</small>
                    </span>
                    <span className="mov-amount">{formatMoney(r.balance, r.account.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="hint page-foot">
        Las cuentas marcadas como ahorro suman en "Ahorraste este mes" cuando les pasás plata. <Link to="/categorias" className="link">Categorías y presupuestos ›</Link>
      </p>

      <AccountSheet edit={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function AccountSheet({ edit, onClose }: { edit: Edit | null; onClose: () => void }) {
  const settings = useSettings();
  const movements = useStore((s) => s.movements);
  const saveSettings = useStore((s) => s.saveSettings);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏦');
  const [color, setColor] = useState(PALETTE[0]!);
  const [currency, setCurrency] = useState<Currency>('ARS');
  const [balanceText, setBalanceText] = useState('');
  const [negative, setNegative] = useState(false);
  const [type, setType] = useState<'normal' | 'tarjeta'>('normal');
  const [savings, setSavings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEdit, setLastEdit] = useState<Edit | null>(null);

  if (edit !== lastEdit) {
    setLastEdit(edit);
    setError(null);
    setBusy(false);
    if (edit?.mode === 'edit') {
      const a = edit.row.account;
      setName(a.name);
      setEmoji(a.emoji);
      setColor(a.color);
      setCurrency(a.currency);
      setType(a.type);
      setSavings(a.savings);
      // En una tarjeta se pregunta lo que debés (positivo)
      const shown = a.type === 'tarjeta' ? -edit.row.balance : edit.row.balance;
      setBalanceText(shown ? amountToInput(Math.abs(shown)) : '0');
      setNegative(shown < 0);
    } else if (edit) {
      setName('');
      setEmoji('🏦');
      setColor(PALETTE[(settings.accounts.length + 3) % PALETTE.length]!);
      setCurrency(settings.currency);
      setBalanceText('');
      setNegative(false);
      setType('normal');
      setSavings(false);
    }
  }

  const row = edit?.mode === 'edit' ? edit.row : null;
  const used = !!row && movements.some((m) => m.accountKey === row.account.key || m.toAccountKey === row.account.key);
  const trimmed = balanceText.trim();
  const parsed = trimmed === '' || trimmed === '0' ? 0 : parseAmount(trimmed);
  const balanceInvalid = parsed === null;
  const entered = (parsed ?? 0) * (negative ? -1 : 1);
  // Tarjeta: lo que escribís es lo que debés, el saldo es negativo
  const desired = type === 'tarjeta' ? -entered : entered;

  const persist = async (accounts: Account[]) => {
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ ...settings, accounts });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const save = () => {
    if (!edit || !name.trim() || balanceInvalid) return;
    if (row) {
      // "Saldo hoy" ajusta el saldo inicial para que la cuenta dé exactamente lo que tenés.
      const fromMovements = row.balance - row.account.initialBalance;
      void persist(
        settings.accounts.map((a) =>
          a.key === row.account.key
            ? { ...a, name: name.trim(), emoji, color, currency: used ? a.currency : currency, initialBalance: desired - fromMovements, type, savings: type === 'normal' && savings }
            : a,
        ),
      );
    } else {
      const key = categoryKey(name, settings.accounts.map((a) => a.key));
      void persist([...settings.accounts, { key, name: name.trim(), emoji, color, currency, initialBalance: desired, type, savings: type === 'normal' && savings, archived: false }]);
    }
  };

  const toggleArchive = () => {
    if (!row) return;
    const a = row.account;
    if (!a.archived && a.type === 'normal' && settings.accounts.filter((x) => !x.archived && x.type === 'normal').length <= 1) {
      setError('Tiene que quedar al menos una cuenta activa.');
      return;
    }
    // Sin movimientos se borra; con movimientos se archiva para no perder el historial.
    if (!a.archived && !used) void persist(settings.accounts.filter((x) => x.key !== a.key));
    else void persist(settings.accounts.map((x) => (x.key === a.key ? { ...x, archived: !x.archived } : x)));
  };

  return (
    <Sheet
      open={!!edit}
      title={row ? row.account.name : 'Nueva cuenta'}
      onClose={onClose}
      footer={
        <>
          {row && (
            <button type="button" className="btn-quiet" onClick={toggleArchive} disabled={busy}>
              {row.account.archived ? 'Reactivar' : used ? 'Archivar' : 'Borrar'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={save} disabled={busy || !name.trim() || balanceInvalid}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Mercado Pago, Galicia, Visa" />
      </label>

      <fieldset className="field">
        <legend>Tipo</legend>
        <div className="segmented">
          <button type="button" className={type === 'normal' ? 'is-on' : ''} disabled={used && type === 'tarjeta'} onClick={() => setType('normal')}>
            Cuenta o billetera
          </button>
          <button type="button" className={type === 'tarjeta' ? 'is-on' : ''} disabled={used && type === 'normal'} onClick={() => setType('tarjeta')}>
            Tarjeta de crédito
          </button>
        </div>
        {type === 'normal' && (
          <label className="toggle-row">
            <input type="checkbox" checked={savings} onChange={(e) => setSavings(e.target.checked)} />
            <span>Es una cuenta de ahorro (cuenta en "Ahorraste este mes")</span>
          </label>
        )}
      </fieldset>

      <fieldset className="field">
        <legend>Moneda</legend>
        <div className="segmented">
          {CURRENCIES.map((c) => (
            <button key={c} type="button" className={currency === c ? 'is-on' : ''} disabled={used} onClick={() => setCurrency(c)}>
              {c === 'ARS' ? 'Pesos' : 'Dólares'}
            </button>
          ))}
        </div>
        {used && <small className="hint">Ya tiene movimientos, así que la moneda queda fija.</small>}
      </fieldset>

      <label className="field">
        <span>
          {type === 'tarjeta'
            ? '¿Cuánto debés hoy en la tarjeta? (lo del resumen que no pagaste)'
            : row
              ? '¿Cuánto tenés hoy en esta cuenta?'
              : '¿Cuánto tenés hoy? (podés dejarlo en 0)'}
        </span>
        <div className="amount-row small">
          <button type="button" className="currency-btn" onClick={() => setNegative((v) => !v)} aria-label="Cambiar signo">
            {negative ? '−' : ''}
            {currency === 'USD' ? 'US$' : '$'}
          </button>
          <input inputMode="decimal" className="amount-input" value={balanceText} onChange={(e) => setBalanceText(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
        </div>
        {balanceInvalid ? (
          <small className="form-error">No entendemos ese monto.</small>
        ) : (
          row &&
          desired !== row.balance && (
            <small className="hint">
              Se ajusta el saldo en {formatMoney(desired - row.balance, row.account.currency, { sign: true })}, sin tocar tus movimientos.
            </small>
          )
        )}
      </label>

      <fieldset className="field">
        <legend>Ícono</legend>
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} type="button" className={`emoji-btn${emoji === e ? ' is-on' : ''}`} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Color</legend>
        <div className="color-grid">
          {PALETTE.map((c) => (
            <button key={c} type="button" className={`color-btn${color === c ? ' is-on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
          ))}
        </div>
      </fieldset>

      {row && (
        <Link to={`/movimientos?cuenta=${row.account.key}`} className="link" onClick={onClose}>
          Ver movimientos de {row.account.name} ›
        </Link>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
