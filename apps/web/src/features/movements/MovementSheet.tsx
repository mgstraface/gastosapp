import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  CURRENCIES,
  METHOD_LABELS,
  addMonths,
  amountToInput,
  formatMoney,
  installmentAmount,
  localDate,
  monthLabel,
  monthOf,
  parseAmount,
  type Currency,
  type Kind,
  type Method,
} from '@gastosapp/shared';
import { Sheet } from '../../components/Sheet';
import { errorText } from '../../lib/api';
import { useSettings, useStore } from '../../lib/store';
import type { MovementSheetTarget } from './registerContext';

const METHODS = Object.keys(METHOD_LABELS) as Method[];
const QUICK_INSTALLMENTS = [1, 3, 6, 9, 12, 18, 24];

export function MovementSheet({ target, onClose }: { target: MovementSheetTarget | null; onClose: () => void }) {
  const settings = useSettings();
  const addMovement = useStore((s) => s.addMovement);
  const updateMovement = useStore((s) => s.updateMovement);
  const deleteMovement = useStore((s) => s.deleteMovement);
  const movements = useStore((s) => s.movements);

  const editing = target?.mode === 'edit' ? target.movement : null;

  const [kind, setKind] = useState<Kind>('gasto');
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<Currency>(settings.currency);
  const [categoryKey, setCategoryKey] = useState('');
  const [date, setDate] = useState(localDate());
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<Method>('debito');
  const [installments, setInstallments] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Último medio de pago usado: suele repetirse.
  const lastMethod = movements.find((m) => m.kind === 'gasto')?.method ?? 'debito';

  useEffect(() => {
    if (!target) return;
    setError(null);
    setBusy(false);
    setConfirmDelete(false);
    if (target.mode === 'edit') {
      const m = target.movement;
      setKind(m.kind);
      setAmountText(amountToInput(m.amount));
      setCurrency(m.currency);
      setCategoryKey(m.categoryKey);
      setDate(m.date);
      setDescription(m.description);
      setMethod(m.method);
      setInstallments(m.installments);
    } else {
      setKind(target.kind ?? 'gasto');
      setAmountText('');
      setCurrency(settings.currency);
      setCategoryKey('');
      setDate(target.date ?? localDate());
      setDescription('');
      setMethod(target.kind === 'ingreso' ? 'transferencia' : lastMethod);
      setInstallments(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const categories = useMemo(
    () => settings.categories.filter((c) => c.kind === kind && (!c.archived || c.key === editing?.categoryKey)),
    [settings.categories, kind, editing],
  );

  const amount = parseAmount(amountText);
  const showInstallments = kind === 'gasto' && method === 'credito';
  const cuotas = showInstallments ? installments : 1;
  const valid = !!amount && !!categoryKey && categories.some((c) => c.key === categoryKey) && !!date;

  const save = async () => {
    if (!valid || !amount) return;
    setBusy(true);
    setError(null);
    const input = { kind, amount, currency, categoryKey, date, description: description.trim(), method, installments: cuotas };
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

  const switchKind = (k: Kind) => {
    setKind(k);
    setCategoryKey('');
    if (k === 'ingreso' && method === 'credito') setMethod('transferencia');
  };

  const title = editing ? (kind === 'gasto' ? 'Editar gasto' : 'Editar ingreso') : kind === 'gasto' ? 'Nuevo gasto' : 'Nuevo ingreso';

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
        <button type="button" role="tab" aria-selected={kind === 'gasto'} className={kind === 'gasto' ? 'is-on' : ''} onClick={() => switchKind('gasto')}>
          Gasto
        </button>
        <button type="button" role="tab" aria-selected={kind === 'ingreso'} className={kind === 'ingreso' ? 'is-on' : ''} onClick={() => switchKind('ingreso')}>
          Ingreso
        </button>
      </div>

      <div className="amount-row">
        <button type="button" className="currency-btn" onClick={() => setCurrency(CURRENCIES[(CURRENCIES.indexOf(currency) + 1) % CURRENCIES.length]!)} aria-label="Cambiar moneda">
          {currency === 'USD' ? 'US$' : '$'}
        </button>
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

      <fieldset className="field">
        <legend>Categoría</legend>
        <div className="cat-grid">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`cat-btn${categoryKey === c.key ? ' is-on' : ''}`}
              style={{ '--cat': c.color } as CSSProperties}
              onClick={() => setCategoryKey(c.key)}
            >
              <span className="cat-emoji" aria-hidden="true">
                {c.emoji}
              </span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Detalle (opcional)</span>
        <input value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'gasto' ? 'Ej.: verdulería, nafta, regalo…' : 'Ej.: sueldo noviembre'} />
      </label>

      <label className="field">
        <span>Fecha</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <fieldset className="field">
        <legend>Medio de pago</legend>
        <div className="chips">
          {METHODS.filter((m) => kind === 'gasto' || m !== 'credito').map((m) => (
            <button key={m} type="button" className={`chip-btn${method === m ? ' is-on' : ''}`} onClick={() => setMethod(m)}>
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </fieldset>

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
          {amount && installments > 1 && (
            <p className="hint">
              {installments} cuotas de {formatMoney(installmentAmount(amount, installments, 1), currency)}, de {monthLabel(monthOf(date))} a{' '}
              {monthLabel(addMonths(monthOf(date), installments - 1))}. Cada mes cuenta solo su cuota.
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
