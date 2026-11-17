import { useState } from 'react';
import { PALETTE, amountToInput, categoryKey, formatMoney, parseAmount, type Category, type Kind } from '@gastosapp/shared';
import { Sheet } from '../../components/Sheet';
import { errorText } from '../../lib/api';
import { useSettings, useStore } from '../../lib/store';

const EMOJIS = ['🛒', '🍕', '🏠', '💡', '🚗', '⛽', '🚌', '💊', '🎉', '📺', '👕', '🐾', '🎁', '✈️', '📚', '🏋️', '💇', '🧒', '🍺', '☕', '📱', '🔧', '💳', '🏷️', '💼', '✨', '💰', '📈'];

type Edit = { mode: 'new'; kind: Kind } | { mode: 'edit'; category: Category };

export function CategoriesScreen() {
  const settings = useSettings();
  const movements = useStore((s) => s.movements);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const used = new Set(movements.map((m) => m.categoryKey));
  const budgetTotal = settings.categories.reduce((s, c) => s + (c.kind === 'gasto' && !c.archived && c.budget ? c.budget : 0), 0);
  const archived = settings.categories.filter((c) => c.archived);

  const list = (kind: Kind) => settings.categories.filter((c) => c.kind === kind && !c.archived);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Categorías</h1>
        <p className="eyebrow">
          {budgetTotal > 0 ? `Presupuesto mensual: ${formatMoney(budgetTotal, settings.currency)}` : 'Poné un tope mensual a las que quieras controlar.'}
        </p>
      </header>

      {(['gasto', 'ingreso'] as const).map((kind) => (
        <section key={kind} className="card">
          <header className="card-head">
            <h2>{kind === 'gasto' ? 'Gastos' : 'Ingresos'}</h2>
            <button type="button" className="link" onClick={() => setEdit({ mode: 'new', kind })}>
              + Nueva
            </button>
          </header>
          <ul className="plain-list">
            {list(kind).map((c) => (
              <li key={c.key}>
                <button type="button" className="cat-line" onClick={() => setEdit({ mode: 'edit', category: c })}>
                  <span className="mov-icon" style={{ background: `${c.color}22`, color: c.color }} aria-hidden="true">
                    {c.emoji}
                  </span>
                  <span className="mov-text">
                    <strong>{c.name}</strong>
                    {kind === 'gasto' && <small>{c.budget ? `Tope ${formatMoney(c.budget, settings.currency)} por mes` : 'Sin tope'}</small>}
                  </span>
                  <span className="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {archived.length > 0 && (
        <section className="card">
          <button type="button" className="link" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Ocultar archivadas' : `Ver archivadas (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="plain-list">
              {archived.map((c) => (
                <li key={c.key}>
                  <button type="button" className="cat-line is-archived" onClick={() => setEdit({ mode: 'edit', category: c })}>
                    <span className="mov-icon" aria-hidden="true">
                      {c.emoji}
                    </span>
                    <span className="mov-text">
                      <strong>{c.name}</strong>
                      <small>Archivada</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <CategorySheet edit={edit} used={used} onClose={() => setEdit(null)} />
    </div>
  );
}

function CategorySheet({ edit, used, onClose }: { edit: Edit | null; used: Set<string>; onClose: () => void }) {
  const settings = useSettings();
  const saveSettings = useStore((s) => s.saveSettings);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏷️');
  const [color, setColor] = useState(PALETTE[0]!);
  const [budgetText, setBudgetText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEdit, setLastEdit] = useState<Edit | null>(null);

  // Al abrir, carga los valores (sin useEffect: se resetea cuando cambia "edit").
  if (edit !== lastEdit) {
    setLastEdit(edit);
    setError(null);
    setBusy(false);
    if (edit?.mode === 'edit') {
      setName(edit.category.name);
      setEmoji(edit.category.emoji);
      setColor(edit.category.color);
      setBudgetText(edit.category.budget ? amountToInput(edit.category.budget) : '');
    } else if (edit) {
      setName('');
      setEmoji(edit.kind === 'gasto' ? '🏷️' : '💰');
      setColor(PALETTE[settings.categories.length % PALETTE.length]!);
      setBudgetText('');
    }
  }

  const kind: Kind = edit?.mode === 'edit' ? edit.category.kind : (edit?.kind ?? 'gasto');
  const budget = budgetText.trim() ? parseAmount(budgetText) : null;
  const budgetInvalid = !!budgetText.trim() && budget === null;

  const persist = async (categories: Category[]) => {
    setBusy(true);
    setError(null);
    try {
      await saveSettings({ ...settings, categories });
      onClose();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const save = () => {
    if (!edit || !name.trim() || budgetInvalid) return;
    const fields = { name: name.trim(), emoji, color, budget: kind === 'gasto' ? budget : null };
    if (edit.mode === 'edit') {
      void persist(settings.categories.map((c) => (c.key === edit.category.key ? { ...c, ...fields } : c)));
    } else {
      const key = categoryKey(name, settings.categories.map((c) => c.key));
      void persist([...settings.categories, { key, kind, archived: false, ...fields }]);
    }
  };

  const toggleArchive = () => {
    if (edit?.mode !== 'edit') return;
    const c = edit.category;
    const activeOfKind = settings.categories.filter((x) => x.kind === c.kind && !x.archived).length;
    if (!c.archived && activeOfKind <= 1) {
      setError('Tiene que quedar al menos una categoría activa.');
      return;
    }
    // Si nunca se usó, se borra del todo; si tiene movimientos, se archiva para no perder el historial.
    if (!c.archived && !used.has(c.key)) void persist(settings.categories.filter((x) => x.key !== c.key));
    else void persist(settings.categories.map((x) => (x.key === c.key ? { ...x, archived: !x.archived } : x)));
  };

  const editingCat = edit?.mode === 'edit' ? edit.category : null;

  return (
    <Sheet
      open={!!edit}
      title={editingCat ? 'Editar categoría' : kind === 'gasto' ? 'Nueva categoría de gasto' : 'Nueva categoría de ingreso'}
      onClose={onClose}
      footer={
        <>
          {editingCat && (
            <button type="button" className="btn-quiet" onClick={toggleArchive} disabled={busy}>
              {editingCat.archived ? 'Reactivar' : used.has(editingCat.key) ? 'Archivar' : 'Borrar'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={save} disabled={busy || !name.trim() || budgetInvalid}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Nafta" />
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

      {kind === 'gasto' && (
        <label className="field">
          <span>Tope mensual en {settings.currency === 'USD' ? 'dólares' : 'pesos'} (opcional)</span>
          <input inputMode="decimal" value={budgetText} onChange={(e) => setBudgetText(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Sin tope" />
          {budgetInvalid && <small className="form-error">No entendemos ese monto.</small>}
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
