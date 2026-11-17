import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  METHOD_LABELS,
  addMonths,
  amountToInput,
  formatMoney,
  installmentAmount,
  localDate,
  monthLabel,
  monthOf,
  parseAmount,
  type Account,
  type Method,
  type MovementKind,
} from '@gastosapp/shared';
import { Sheet } from '../../components/Sheet';
import { errorText } from '../../lib/api';
import { useSettings, useStore } from '../../lib/store';
import type { MovementSheetTarget } from './registerContext';

const QUICK_INSTALLMENTS = [1, 3, 6, 9, 12, 18, 24];
const GASTO_METHODS: Method[] = ['debito', 'credito', 'efectivo', 'transferencia', 'otro'];

export function MovementSheet({ target, onClose }: { target: MovementSheetTarget | null; onClose: () => void }) {
  const settings = useSettings();
  const addMovement = useStore((s) => s.addMovement);
  const updateMovement = useStore((s) => s.updateMovement);
  const deleteMovement = useStore((s) => s.deleteMovement);
  const movements = useStore((s) => s.movements);

  const editing = target?.mode === 'edit' ? target.movement : null;

  const [kind, setKind] = useState<MovementKind>('gasto');
  const [amountText, setAmountText] = useState('');
  const [toAmountText, setToAmountText] = useState('');
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [toAccountKey, setToAccountKey] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState('');
  const [date, setDate] = useState(localDate());
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<Method>('debito');
  const [installments, setInstallments] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeAccounts = settings.accounts.filter((a) => !a.archived || a.key === editing?.accountKey || a.key === editing?.toAccountKey);
  // Lo último usado suele repetirse
  const lastGasto = movements.find((m) => m.kind === 'gasto' && m.accountKey);
  const lastIngreso = movements.find((m) => m.kind === 'ingreso' && m.accountKey);
  const firstAccount = activeAccounts.find((a) => a.currency === settings.currency)?.key ?? activeAccounts[0]?.key ?? null;

  useEffect(() => {
    if (!target) return;
    setError(null);
    setBusy(false);
    setConfirmDelete(false);
    if (target.mode === 'edit') {
      const m = target.movement;
      setKind(m.kind);
      setAmountText(amountToInput(m.amount));
      setToAmountText(m.toAmount ? amountToInput(m.toAmount) : '');
      setAccountKey(m.accountKey);
      setToAccountKey(m.toAccountKey);
      setCategoryKey(m.categoryKey);
      setDate(m.date);
      setDescription(m.description);
      setMethod(m.method);
      setInstallments(m.installments);
    } else {
      const k = target.kind ?? 'gasto';
      const last = k === 'ingreso' ? lastIngreso : lastGasto;
      setKind(k);
      setAmountText('');
      setToAmountText('');
      setAccountKey(target.accountKey ?? (last?.accountKey && activeAccounts.some((a) => a.key === last.accountKey) ? last.accountKey : firstAccount));
      setToAccountKey(null);
      setCategoryKey('');
      setDate(target.date ?? localDate());
      setDescription('');
      setMethod(k === 'ingreso' ? 'transferencia' : (lastGasto?.method ?? 'debito'));
      setInstallments(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const categories = useMemo(
    () => settings.categories.filter((c) => c.kind === kind && (!c.archived || c.key === editing?.categoryKey)),
    [settings.categories, kind, editing],
  );

  const from = activeAccounts.find((a) => a.key === accountKey) ?? null;
  const to = activeAccounts.find((a) => a.key === toAccountKey) ?? null;
  // La moneda la define la cuenta. Movimientos viejos sin cuenta mantienen la suya.
  const currency = from?.currency ?? editing?.currency ?? settings.currency;
  const crossCurrency = kind === 'transferencia' && !!from && !!to && from.currency !== to.currency;

  const amount = parseAmount(amountText);
  const toAmount = crossCurrency ? parseAmount(toAmountText) : null;
  const showInstallments = kind === 'gasto' && method === 'credito';
  const cuotas = showInstallments ? installments : 1;

  const valid =
    !!amount &&
    !!date &&
    !!from &&
    (kind === 'transferencia' ? !!to && to.key !== from.key && (!crossCurrency || !!toAmount) : categories.some((c) => c.key === categoryKey));

  const save = async () => {
    if (!valid || !amount) return;
    setBusy(true);
    setError(null);
    const input = {
      kind,
      amount,
      currency,
      categoryKey: kind === 'transferencia' ? '' : categoryKey,
      accountKey,
      toAccountKey: kind === 'transferencia' ? toAccountKey : null,
      toAmount: crossCurrency ? toAmount : null,
      date,
      description: description.trim(),
      method: kind === 'transferencia' ? ('transferencia' as const) : method,
      installments: cuotas,
    };
    try {
      if (editing) await updateMovement(editing.id, input);
      else await addMovement(input);
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await deleteMovement(editing.id);
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const switchKind = (k: MovementKind) => {
    setKind(k);
    setCategoryKey('');
    if (k !== 'gasto' && method === 'credito') setMethod('transferencia');
    if (k === 'transferencia' && toAccountKey === accountKey) setToAccountKey(null);
  };

  const noun = kind === 'gasto' ? 'gasto' : kind === 'ingreso' ? 'ingreso' : 'transferencia';
  const title = editing ? `Editar ${noun}` : kind === 'transferencia' ? 'Nueva transferencia' : `Nuevo ${noun}`;

  // Cotización implícita en compras/ventas de dólares
  const rate =
    crossCurrency && amount && toAmount && from ? Math.round(((from.currency === 'ARS' ? amount : toAmount) / (from.currency === 'ARS' ? toAmount : amount)) * 100) : null;

  return (
    <Sheet
      open={!!target}
      title={title}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <button type="button" className={confirmDelete ? 'btn-danger' : 'btn-quiet'} onClick={() => void remove()} disabled={busy}>
              {confirmDelete ? '¿Seguro?' : 'Borrar'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy || !valid}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="segmented" role="tablist" aria-label="Tipo">
        {(['gasto', 'ingreso', 'transferencia'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => switchKind(k)}>
            {k === 'gasto' ? 'Gasto' : k === 'ingreso' ? 'Ingreso' : 'Transferencia'}
          </button>
        ))}
      </div>

      <div className="amount-row">
        <span className="currency-btn">{currency === 'USD' ? 'US$' : '$'}</span>
        <input
          className="amount-input"
          inputMode="decimal"
          placeholder="0"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ''))}
          autoFocus={!editing}
          aria-label="Monto"
        />
      </div>
      {amountText && !amount && <p className="form-error">No entendemos ese monto. Probá con algo como 12500 o 12.500,50</p>}

      <AccountPicker
        label={kind === 'ingreso' ? '¿A qué cuenta entra?' : kind === 'transferencia' ? 'Sale de' : '¿De qué cuenta sale?'}
        accounts={activeAccounts}
        value={accountKey}
        onChange={setAccountKey}
      />
      {editing && !editing.accountKey && !accountKey && <p className="hint">Este movimiento es de antes de las cuentas: elegí una para que sume en su saldo.</p>}

      {kind === 'transferencia' ? (
        <>
          <AccountPicker label="Entra en" accounts={activeAccounts.filter((a) => a.key !== accountKey)} value={toAccountKey} onChange={setToAccountKey} />
          {crossCurrency && to && (
            <label className="field">
              <span>
                ¿Cuánto entra en {to.name}? ({to.currency === 'USD' ? 'US$' : '$'})
              </span>
              <input inputMode="decimal" value={toAmountText} onChange={(e) => setToAmountText(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
              {rate && <small className="hint">Cotización: {formatMoney(rate, 'ARS')} por dólar</small>}
            </label>
          )}
        </>
      ) : (
        <fieldset className="field">
          <legend>Categoría</legend>
          <div className="cat-grid">
            {categories.map((c) => (
              <button key={c.key} type="button" className={`cat-btn${categoryKey === c.key ? ' is-on' : ''}`} style={{ '--cat': c.color } as CSSProperties} onClick={() => setCategoryKey(c.key)}>
                <span className="cat-emoji" aria-hidden="true">
                  {c.emoji}
                </span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="field">
        <span>Detalle (opcional)</span>
        <input
          value={description}
          maxLength={120}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={kind === 'gasto' ? 'Ej.: verdulería, nafta, regalo…' : kind === 'ingreso' ? 'Ej.: sueldo noviembre' : 'Ej.: saqué del cajero'}
        />
      </label>

      <label className="field">
        <span>Fecha</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      {kind === 'gasto' && (
        <fieldset className="field">
          <legend>Cómo pagaste</legend>
          <div className="chips">
            {GASTO_METHODS.map((m) => (
              <button key={m} type="button" className={`chip-btn${method === m ? ' is-on' : ''}`} onClick={() => setMethod(m)}>
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {showInstallments && (
        <fieldset className="field">
          <legend>Cuotas</legend>
          <div className="chips">
            {QUICK_INSTALLMENTS.map((n) => (
              <button key={n} type="button" className={`chip-btn${installments === n ? ' is-on' : ''}`} onClick={() => setInstallments(n)}>
                {n === 1 ? '1 pago' : n}
              </button>
            ))}
            <input
              className="chip-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              aria-label="Otra cantidad de cuotas"
              value={QUICK_INSTALLMENTS.includes(installments) ? '' : installments}
              placeholder="Otra"
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (n >= 1 && n <= 60) setInstallments(n);
              }}
            />
          </div>
          {amount && (
            <p className="hint">
              {installments > 1
                ? `${installments} cuotas de ${formatMoney(installmentAmount(amount, installments, 1), currency)}, de ${monthLabel(monthOf(date))} a ${monthLabel(addMonths(monthOf(date), installments - 1))}. `
                : ''}
              {from ? `Cada mes, la cuota se descuenta de ${from.name} (desde donde pagás la tarjeta).` : ''}
            </p>
          )}
        </fieldset>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function AccountPicker({ label, accounts, value, onChange }: { label: string; accounts: Account[]; value: string | null; onChange: (k: string) => void }) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="chips">
        {accounts.map((a) => (
          <button key={a.key} type="button" className={`chip-btn${value === a.key ? ' is-on' : ''}`} onClick={() => onChange(a.key)}>
            {a.emoji} {a.name}
            {a.currency === 'USD' && ' (US$)'}
          </button>
        ))}
      </div>
      {accounts.length === 0 && <p className="hint">Creá una cuenta en la pestaña Cuentas.</p>}
    </fieldset>
  );
}
