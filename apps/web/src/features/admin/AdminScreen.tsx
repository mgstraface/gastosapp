import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminUserRow } from '@gastosapp/shared';
import { Sheet } from '../../components/Sheet';
import { api, errorText } from '../../lib/api';
import { useStore } from '../../lib/store';

const randomPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

type Edit = { mode: 'new' } | { mode: 'edit'; user: AdminUserRow };

export function AdminScreen() {
  const me = useStore((s) => s.user);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  /** Contraseña recién creada o cambiada: se muestra una sola vez para pasársela a la persona */
  const [reveal, setReveal] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await api<AdminUserRow[]>('/admin/users'));
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page admin">
      <header className="page-head">
        <Link to="/yo" className="link">
          ‹ Volver
        </Link>
        <h1>Usuarios</h1>
      </header>

      {reveal && (
        <div className="notice">
          <p>
            Pasale estos datos a <strong>{reveal.username}</strong> (no se vuelven a mostrar):
          </p>
          <p className="mono">
            Usuario: {reveal.username}
            <br />
            Contraseña: {reveal.password}
          </p>
          <button type="button" className="link" onClick={() => setReveal(null)}>
            Listo
          </button>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      <section className="card">
        <header className="card-head">
          <h2>{users ? `${users.length} cuentas` : 'Cargando…'}</h2>
          <button type="button" className="link" onClick={() => setEdit({ mode: 'new' })}>
            + Nueva cuenta
          </button>
        </header>
        <ul className="plain-list">
          {users?.map((u) => (
            <li key={u.id}>
              <button type="button" className={`cat-line${u.active ? '' : ' is-archived'}`} onClick={() => setEdit({ mode: 'edit', user: u })}>
                <span className="mov-text">
                  <strong>
                    {u.displayName} {u.role === 'admin' && <span className="badge">admin</span>}
                    {!u.active && <span className="badge">inactiva</span>}
                  </strong>
                  <small>
                    @{u.username} · {u.movementCount} movimientos · último {fmtDate(u.lastMovementAt)}
                  </small>
                </span>
                <span className="chev" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <UserSheet
        edit={edit}
        isMe={edit?.mode === 'edit' && edit.user.id === me?.id}
        onClose={() => setEdit(null)}
        onDone={(r) => {
          setEdit(null);
          if (r) setReveal(r);
          void load();
        }}
      />
    </div>
  );
}

function UserSheet({ edit, isMe, onClose, onDone }: { edit: Edit | null; isMe: boolean; onClose: () => void; onDone: (reveal?: { username: string; password: string }) => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lastEdit, setLastEdit] = useState<Edit | null>(null);

  if (edit !== lastEdit) {
    setLastEdit(edit);
    setError(null);
    setBusy(false);
    setConfirmDelete(false);
    setUsername(edit?.mode === 'edit' ? edit.user.username : '');
    setDisplayName(edit?.mode === 'edit' ? edit.user.displayName : '');
    setRole('user');
  }

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  const create = () =>
    act(async () => {
      const password = randomPassword();
      await api('/admin/users', { method: 'POST', body: { username: username.trim().toLowerCase(), displayName: displayName.trim(), password, role } });
      onDone({ username: username.trim().toLowerCase(), password });
    });

  const u = edit?.mode === 'edit' ? edit.user : null;

  return (
    <Sheet open={!!edit} title={u ? u.displayName : 'Nueva cuenta'} onClose={onClose}>
      {!u ? (
        <>
          <label className="field">
            <span>Nombre para mostrar</span>
            <input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="field">
            <span>Usuario (para entrar)</span>
            <input value={username} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <div className="segmented">
            <button type="button" className={role === 'user' ? 'is-on' : ''} onClick={() => setRole('user')}>
              Usuario
            </button>
            <button type="button" className={role === 'admin' ? 'is-on' : ''} onClick={() => setRole('admin')}>
              Admin
            </button>
          </div>
          <p className="hint">La contraseña se genera sola y te la mostramos una vez para que se la pases.</p>
          <button type="button" className="btn-primary" disabled={busy || username.trim().length < 3 || !displayName.trim()} onClick={() => void create()}>
            Crear cuenta
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span>Nombre para mostrar</span>
            <input value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !displayName.trim() || displayName.trim() === u.displayName}
            onClick={() => void act(async () => (await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { displayName: displayName.trim() } }), onDone()))}
          >
            Guardar nombre
          </button>
          <button
            type="button"
            className="btn-quiet"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const password = randomPassword();
                await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { password } });
                onDone({ username: u.username, password });
              })
            }
          >
            Asignar contraseña nueva
          </button>
          {!isMe && (
            <>
              <button
                type="button"
                className="btn-quiet"
                disabled={busy}
                onClick={() => void act(async () => (await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }), onDone()))}
              >
                {u.active ? 'Desactivar cuenta' : 'Reactivar cuenta'}
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={busy}
                onClick={() => (confirmDelete ? void act(async () => (await api(`/admin/users/${u.id}`, { method: 'DELETE' }), onDone())) : setConfirmDelete(true))}
              >
                {confirmDelete ? `¿Borrar a ${u.username} y todos sus datos?` : 'Borrar cuenta'}
              </button>
            </>
          )}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
