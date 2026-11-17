import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CURRENCIES, PALETTE, accountBalances, amountToInput, categoryKey, formatMoney, localDate, parseAmount, type Account, type AccountBalance, type Currency } from '@gastosapp/shared';
import { Sheet } from '../../components/Sheet';
import { errorText } from '../../lib/api';
import { useSettings, useStore } from '../../lib/store';
import { useRegister } from '../movements/registerContext';

const EMOJIS = ['💵', '🏦', '💳', '📱', '🐷', '💰', '🪙', '📈', '🏠', '✈️', '🎯', '🧾'];

type Edit = { mode: 'new' } | { mode: 'edit'; row: AccountBalance };

export function AccountsScreen() {
  const settings = useSettings();
  const movements = useStore((s) => s.movements);
  const open = useRegister();
  const [edit, setEdit] = useState<Edit | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const b = useMemo(() => accountBalances(movements, settings, localDate()), [movements, settings]);
  const active = b.accounts.filter((r) => !r.account.archived);
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
                  <strong>{r.account.name}</strong>
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
        Los gastos con tarjeta de crédito se descuentan de la cuenta que elegiste, cuota a cuota, a medida que llega cada mes. <Link to="/categorias" className="link">Categorías y presupuestos ›</Link>
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
      setBalanceText(edit.row.balance ? amountToInput(Math.abs(edit.row.balance)) : '0');
      setNegative(edit.row.balance < 0);
    } else if (edit) {
      setName('');
      setEmoji('🏦');
      setColor(PALETTE[(settings.accounts.length + 3) % PALETTE.length]!);
      setCurrency(settings.currency);
      setBalanceText('');
      setNegative(false);
    }
  }

  const row = edit?.mode === 'edit' ? edit.row : null;
  const used = !!row && movements.some((m) => m.accountKey === row.account.key || m.toAccountKey === row.account.key);
  const trimmed = balanceText.trim();
  const parsed = trimmed === '' || trimmed === '0' ? 0 : parseAmount(trimmed);
  const balanceInvalid = parsed === null;
  const desired = (parsed ?? 0) * (negative ? -1 : 1);

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
          a.key === row.account.key ? { ...a, name: name.trim(), emoji, color, currency: used ? a.currency : currency, initialBalance: desired - fromMovements } : a,
        ),
      );
    } else {
      const key = categoryKey(name, settings.accounts.map((a) => a.key));
      void persist([...settings.accounts, { key, name: name.trim(), emoji, color, currency, initialBalance: desired, archived: false }]);
    }
  };

  const toggleArchive = () => {
    if (!row) return;
    const a = row.account;
    if (!a.archived && settings.accounts.filter((x) => !x.archived).length <= 1) {
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
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Mercado Pago, Galicia" />
      </label>

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
        <span>{row ? '¿Cuánto tenés hoy en esta cuenta?' : '¿Cuánto tenés hoy? (podés dejarlo en 0)'}</span>
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
