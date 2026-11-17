import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryKey, formatMoney, personBalances, type Currency, type Person } from '@gastosapp/shared';
import { MovementRow } from '../../components/MovementRow';
import { Sheet } from '../../components/Sheet';
import { errorText } from '../../lib/api';
import { useSettings, useStore } from '../../lib/store';
import { useRegister } from '../movements/registerContext';

const EMOJIS = ['🙂', '😎', '🧑', '👩', '👨', '🧔', '👵', '👴', '🏠', '❤️', '⭐', '🐶'];

/** Gastos compartidos: quién le debe a quién, y saldar. */
export function SharedScreen() {
  const settings = useSettings();
  const movements = useStore((s) => s.movements);
  const open = useRegister();
  const [edit, setEdit] = useState<Person | 'new' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const balances = useMemo(() => personBalances(movements, settings), [movements, settings]);
  const history = useMemo(
    () => (selected ? movements.filter((m) => m.split?.personKey === selected || m.personKey === selected).slice(0, 40) : []),
    [movements, selected],
  );

  const settle = (p: Person, cur: Currency, balance: number) => {
    // Te debe → cobrás (entra a una cuenta). Le debés → pagás (sale de una cuenta).
    const account = settings.accounts.find((a) => !a.archived && a.type === 'normal' && a.currency === cur)?.key ?? null;
    open({
      mode: 'new',
      prefill: {
        kind: 'transferencia',
        amount: Math.abs(balance),
        personKey: p.key,
        accountKey: balance < 0 ? account : null,
        toAccountKey: balance > 0 ? account : null,
        description: balance > 0 ? `${p.name} me pagó` : `Le pagué a ${p.name}`,
      },
    });
  };

  return (
    <div className="page">
      <header className="page-head">
        <Link to="/yo" className="link">
          ‹ Yo
        </Link>
        <h1>Gastos compartidos</h1>
        <p className="eyebrow">Cargá un gasto, tildá "Gasto compartido" y elegí con quién. Acá ves quién le debe a quién.</p>
      </header>

      <section className="card">
        <header className="card-head">
          <h2>Personas</h2>
          <button type="button" className="link" onClick={() => setEdit('new')}>
            + Agregar
          </button>
        </header>
        {settings.people.length === 0 && <p className="hint">Sumá a las personas con las que compartís gastos (pareja, roommate, amigos).</p>}
        <ul className="plain-list">
          {settings.people.map((p) => {
            const b = balances.find((x) => x.key === p.key);
            const curs = (['ARS', 'USD'] as const).filter((c) => (b?.balance[c] ?? 0) !== 0);
            return (
              <li key={p.key} className="card-row">
                <button type="button" className="cat-line" onClick={() => setSelected(selected === p.key ? null : p.key)}>
                  <span className="mov-icon" aria-hidden="true">
                    {p.emoji}
                  </span>
                  <span className="mov-text">
                    <strong>{p.name}</strong>
                    <small>{b?.count ? `${b.count} movimientos · tocá para ver` : 'Sin movimientos todavía'}</small>
                  </span>
                  <span className="mov-amount">
                    {curs.length === 0
                      ? 'Están a mano'
                      : curs.map((c) => (
                          <span key={c} className={b!.balance[c] > 0 ? 'pos' : 'neg'}>
                            {b!.balance[c] > 0 ? 'Te debe ' : 'Le debés '}
                            {formatMoney(Math.abs(b!.balance[c]), c)}
                          </span>
                        ))}
                  </span>
                </button>
                <div className="row-actions">
                  {curs.map((c) => (
                    <button key={c} type="button" className="btn-quiet small" onClick={() => settle(p, c, b!.balance[c])}>
                      Saldar {formatMoney(Math.abs(b!.balance[c]), c)}
                    </button>
                  ))}
                  <button type="button" className="btn-quiet small" onClick={() => setEdit(p)}>
                    Editar
                  </button>
                </div>
                {selected === p.key && (
                  <div className="mov-list">
                    {history.length === 0 ? (
                      <p className="hint">Nada todavía.</p>
                    ) : (
                      history.map((m) => <MovementRow key={m.id} line={{ movement: m, amount: m.split ? m.split.myPart : m.amount, installment: 1 }} />)
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <p className="hint page-foot">
        "Pagué yo": de tu cuenta sale el total, en tus gastos cuenta solo tu parte y la otra persona te debe el resto. "Pagó la otra persona": no sale plata tuya, en tus gastos
        cuenta tu parte y se la debés. Al saldar se registra la transferencia y la deuda vuelve a cero.
      </p>

      <PersonSheet edit={edit} onClose={() => setEdit(null)} used={(k) => balances.some((b) => b.key === k && b.count > 0)} />
    </div>
  );
}

function PersonSheet({ edit, onClose, used }: { edit: Person | 'new' | null; onClose: () => void; used: (key: string) => boolean }) {
  const settings = useSettings();
  const saveSettings = useStore((s) => s.saveSettings);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🙂');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Person | 'new' | null>(null);

  if (edit !== last) {
    setLast(edit);
    setError(null);
    setBusy(false);
    setName(edit && edit !== 'new' ? edit.name : '');
    setEmoji(edit && edit !== 'new' ? edit.emoji : '🙂');
  }

  const persist = async (people: Person[]) => {
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ ...settings, people });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const save = () => {
    if (!name.trim() || !edit) return;
    if (edit === 'new') void persist([...settings.people, { key: categoryKey(name, settings.people.map((p) => p.key)), name: name.trim(), emoji }]);
    else void persist(settings.people.map((p) => (p.key === edit.key ? { ...p, name: name.trim(), emoji } : p)));
  };

  const existing = edit && edit !== 'new' ? edit : null;

  return (
    <Sheet
      open={!!edit}
      title={existing ? existing.name : 'Nueva persona'}
      onClose={onClose}
      footer={
        <>
          {existing && !used(existing.key) && (
            <button type="button" className="btn-quiet" disabled={busy} onClick={() => void persist(settings.people.filter((p) => p.key !== existing.key))}>
              Borrar
            </button>
          )}
          <button type="button" className="btn-primary" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Ana" />
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
      {existing && used(existing.key) && <p className="hint">Tiene movimientos, así que no se puede borrar (sí renombrar).</p>}
      {error && <p className="form-error">{error}</p>}
    </Sheet>
  );
}
