import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CURRENCIES, localDate, type Movement, type Settings } from '@gastosapp/shared';
import { api, errorText } from '../../lib/api';
import { download, movementsCsv } from '../../lib/files';
import { useSettings, useStore } from '../../lib/store';

export function SettingsScreen() {
  const settings = useSettings();
  const user = useStore((s) => s.user);
  const movements = useStore((s) => s.movements);
  const saveSettings = useStore((s) => s.saveSettings);
  const logout = useStore((s) => s.logout);
  const wipeData = useStore((s) => s.wipeData);
  const reloadMovements = useStore((s) => s.reloadMovements);

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = () =>
    run(async () => {
      const data = await api<unknown>('/me/export');
      download(`gastos-respaldo-${localDate()}.json`, JSON.stringify(data, null, 2), 'application/json');
    });

  const importBackup = (file: File) =>
    run(async () => {
      let data: { settings?: Settings; movements?: Movement[] };
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error('Ese archivo no es un respaldo de Gastos.');
      }
      if (!Array.isArray(data.movements)) throw new Error('Ese archivo no es un respaldo de Gastos.');
      // Suma las categorías del respaldo que no existan acá, para que nada quede "sin categoría".
      const keys = new Set(settings.categories.map((c) => c.key));
      const extra = (data.settings?.categories ?? []).filter((c) => !keys.has(c.key));
      if (extra.length) await saveSettings({ ...settings, categories: [...settings.categories, ...extra] });
      const movs = data.movements.map(({ kind, amount, currency, categoryKey, date, description, method, installments }) => ({
        kind,
        amount,
        currency,
        categoryKey,
        date,
        description,
        method,
        installments,
      }));
      const res = await api<{ imported: number }>('/me/import', { method: 'POST', body: { movements: movs } });
      await reloadMovements();
      return `Listo: se sumaron ${res.imported} movimientos.`;
    });

  return (
    <div className="page">
      <header className="page-head">
        <h1>{user?.displayName}</h1>
        <p className="eyebrow">@{user?.username}</p>
      </header>

      <section className="card">
        <h2>Moneda principal</h2>
        <p className="hint">La que aparece primero al cargar y la de los presupuestos. Los movimientos en la otra moneda se suman aparte.</p>
        <div className="segmented">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              className={settings.currency === c ? 'is-on' : ''}
              disabled={busy}
              onClick={() => void run(async () => saveSettings({ ...settings, currency: c }))}
            >
              {c === 'ARS' ? 'Pesos ($)' : 'Dólares (US$)'}
            </button>
          ))}
        </div>
      </section>

      <PasswordCard />

      <section className="card">
        <h2>Mis datos</h2>
        <div className="stack">
          <button type="button" className="btn-quiet" disabled={!movements.length} onClick={() => download(`gastos-${localDate()}.csv`, movementsCsv(movements, settings), 'text/csv;charset=utf-8')}>
            Descargar planilla (CSV)
          </button>
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => void exportBackup()}>
            Descargar respaldo completo
          </button>
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => fileRef.current?.click()}>
            Importar un respaldo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importBackup(f);
            }}
          />
        </div>
        {msg && <p className={msg.ok ? 'hint' : 'form-error'}>{msg.text}</p>}
      </section>

      <section className="card">
        <h2>Borrar todo</h2>
        <p className="hint">Borra todos tus movimientos y vuelve las categorías a las de fábrica. No se puede deshacer.</p>
        <label className="field">
          <span>Escribí BORRAR para confirmar</span>
          <input value={confirmWipe} onChange={(e) => setConfirmWipe(e.target.value)} autoCapitalize="characters" />
        </label>
        <button
          type="button"
          className="btn-danger"
          disabled={busy || confirmWipe.trim().toUpperCase() !== 'BORRAR'}
          onClick={() =>
            void run(async () => {
              await wipeData();
              setConfirmWipe('');
              return 'Listo, quedó todo en cero.';
            })
          }
        >
          Borrar mis datos
        </button>
      </section>

      <section className="card stack">
        {user?.role === 'admin' && (
          <Link to="/admin" className="btn-quiet as-btn">
            Administrar usuarios
          </Link>
        )}
        <button type="button" className="btn-quiet" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </section>
    </div>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api('/auth/password', { method: 'PUT', body: { current, next } });
      setCurrent('');
      setNext('');
      setMsg({ ok: true, text: 'Contraseña cambiada.' });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Contraseña</h2>
      <label className="field">
        <span>Actual</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="field">
        <span>Nueva (mínimo 6 caracteres)</span>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <button type="button" className="btn-primary" disabled={busy || !current || next.length < 6} onClick={() => void submit()}>
        Cambiar contraseña
      </button>
      {msg && <p className={msg.ok ? 'hint' : 'form-error'}>{msg.text}</p>}
    </section>
  );
}
