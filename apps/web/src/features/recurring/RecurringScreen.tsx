import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { METHOD_LABELS, amountToInput, categoryKey, formatMoney, parseAmount, type Kind, type Method, type Recurring } from '@gastosapp/shared';
import { Sheet } from '../../components/Sheet';
import { errorText } from '../../lib/api';
import { useSettings, useStore } from '../../lib/store';

type Edit = { mode: 'new'; kind: Kind } | { mode: 'edit'; item: Recurring };

/** Gastos e ingresos fijos: se cargan una vez y cada mes aparecen en el inicio para confirmar. */
export function RecurringScreen() {
  const settings = useSettings();
  const [edit, setEdit] = useState<Edit | null>(null);

  const totalOf = (kind: Kind) =>
    settings.recurring.filter((r) => r.kind === kind && r.active && r.currency === settings.currency).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="page">
      <header className="page-head">
        <Link to="/yo" className="link">
          ‹ Yo
        </Link>
        <h1>Fijos del mes</h1>
        <p className="eyebrow">Se cargan una vez y cada mes aparecen en el inicio para confirmarlos con un toque.</p>
      </header>

      {(['gasto', 'ingreso'] as const).map((kind) => {
        const list = settings.recurring.filter((r) => r.kind === kind).sort((a, b) => a.day - b.day);
        return (
          <section key={kind} className="card">
            <header className="card-head">
              <h2>{kind === 'gasto' ? 'Gastos fijos' : 'Ingresos fijos'}</h2>
              <button type="button" className="link" onClick={() => setEdit({ mode: 'new', kind })}>
                + Nuevo
              </button>
            </header>
            {list.length === 0 ? (
              <p className="hint">{kind === 'gasto' ? 'Alquiler, expensas, servicios, internet, suscripciones…' : 'Sueldo, alquiler que cobrás…'}</p>
            ) : (
              <ul className="plain-list">
                {list.map((r) => {
                  const c = settings.categories.find((x) => x.key === r.categoryKey);
                  const a = settings.accounts.find((x) => x.key === r.accountKey);
                  return (
                    <li key={r.key}>
                      <button type="button" className={`cat-line${r.active ? '' : ' is-archived'}`} onClick={() => setEdit({ mode: 'edit', item: r })}>
                        <span className="mov-icon" style={{ background: `${c?.color ?? '#8a94a6'}22` }} aria-hidden="true">
                          {c?.emoji ?? '📌'}
                        </span>
                        <span className="mov-text">
                          <strong>{r.description}</strong>
                          <small>
                            Día {r.day}
                            {a ? ` · ${a.emoji} ${a.name}` : ''}
                            {r.active ? '' : ' · pausado'}
                          </small>
                        </span>
                        <span className={`mov-amount${kind === 'ingreso' ? ' is-income' : ''}`}>{formatMoney(r.amount, r.currency)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {list.length > 0 && (
              <p className="hint">
                Total por mes: {formatMoney(totalOf(kind), settings.currency)}
                {list.some((r) => r.currency !== settings.currency) ? ' (más los de la otra moneda)' : ''}
              </p>
            )}
          </section>
        );
      })}

      <RecurringSheet edit={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function RecurringSheet({ edit, onClose }: { edit: Edit | null; onClose: () => void }) {
  const settings = useSettings();
  const saveSettings = useStore((s) => s.saveSettings);
  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [catKey, setCatKey] = useState('');
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('debito');
  const [day, setDay] = useState(1);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEdit, setLastEdit] = useState<Edit | null>(null);

  if (edit !== lastEdit) {
    setLastEdit(edit);
    setError(null);
    setBusy(false);
    if (edit?.mode === 'edit') {
      const r = edit.item;
      setDescription(r.description);
      setAmountText(amountToInput(r.amount));
      setCatKey(r.categoryKey);
      setAccountKey(r.accountKey);
      setMethod(r.method);
      setDay(r.day);
      setActive(r.active);
    } else if (edit) {
      setDescription('');
      setAmountText('');
      setCatKey('');
      setAccountKey(settings.accounts.find((a) => !a.archived && a.type === 'normal')?.key ?? null);
      setMethod(edit.kind === 'ingreso' ? 'transferencia' : 'debito');
      setDay(1);
      setActive(true);
    }
  }

  const kind: Kind = edit?.mode === 'edit' ? edit.item.kind : (edit?.kind ?? 'gasto');
  const amount = parseAmount(amountText);
  const accounts = settings.accounts.filter((a) => !a.archived && (kind === 'gasto' || a.type === 'normal'));
  const account = settings.accounts.find((a) => a.key === accountKey);
  const categories = settings.categories.filter((c) => c.kind === kind && !c.archived);
  const valid = !!description.trim() && !!amount && categories.some((c) => c.key === catKey) && !!account;

  const persist = async (recurring: Recurring[]) => {
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ ...settings, recurring });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const save = () => {
    if (!edit || !valid || !amount || !account) return;
    const fields = {
      kind,
      description: description.trim(),
      amount,
      currency: account.currency,
      categoryKey: catKey,
      accountKey,
      method: account.type === 'tarjeta' ? ('credito' as const) : method,
      day,
      active,
    };
    if (edit.mode === 'edit') void persist(settings.recurring.map((r) => (r.key === edit.item.key ? { ...r, ...fields } : r)));
    else void persist([...settings.recurring, { key: categoryKey(description, settings.recurring.map((r) => r.key)), ...fields }]);
  };

  const remove = () => {
    if (edit?.mode !== 'edit') return;
    void persist(settings.recurring.filter((r) => r.key !== edit.item.key));
  };

  return (
    <Sheet
      open={!!edit}
      title={edit?.mode === 'edit' ? 'Editar fijo' : kind === 'gasto' ? 'Nuevo gasto fijo' : 'Nuevo ingreso fijo'}
      onClose={onClose}
      footer={
        <>
          {edit?.mode === 'edit' && (
            <button type="button" className="btn-quiet" onClick={remove} disabled={busy}>
              Borrar
            </button>
          )}
          <button type="button" className="btn-primary" onClick={save} disabled={busy || !valid}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={description} maxLength={60} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'gasto' ? 'Ej.: Alquiler, Netflix, Luz' : 'Ej.: Sueldo'} />
      </label>

      <label className="field">
        <span>Monto aproximado (lo podés ajustar cada mes al confirmarlo)</span>
        <div className="amount-row small">
          <span className="currency-btn">{account?.currency === 'USD' ? 'US$' : '$'}</span>
          <input className="amount-input" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
        </div>
      </label>

      <label className="field">
        <span>Día del mes en que {kind === 'gasto' ? 'vence' : 'se cobra'}</span>
        <input type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(Math.min(31, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
      </label>

      <fieldset className="field">
        <legend>{kind === 'gasto' ? '¿De qué cuenta sale?' : '¿A qué cuenta entra?'}</legend>
        <div className="chips">
          {accounts.map((a) => (
            <button key={a.key} type="button" className={`chip-btn${accountKey === a.key ? ' is-on' : ''}`} onClick={() => setAccountKey(a.key)}>
              {a.emoji} {a.name}
              {a.currency === 'USD' && ' (US$)'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Categoría</legend>
        <div className="cat-grid">
          {categories.map((c) => (
            <button key={c.key} type="button" className={`cat-btn${catKey === c.key ? ' is-on' : ''}`} style={{ '--cat': c.color } as CSSProperties} onClick={() => setCatKey(c.key)}>
              <span className="cat-emoji" aria-hidden="true">
                {c.emoji}
              </span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {kind === 'gasto' && account?.type !== 'tarjeta' && (
        <fieldset className="field">
          <legend>Cómo se paga</legend>
          <div className="chips">
            {(['debito', 'transferencia', 'efectivo', 'otro'] as const).map((m) => (
              <button key={m} type="button" className={`chip-btn${method === m ? ' is-on' : ''}`} onClick={() => setMethod(m)}>
                {METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {edit?.mode === 'edit' && (
        <label className="toggle-row">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Activo (si lo pausás, deja de aparecer cada mes)</span>
        </label>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
