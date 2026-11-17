import { create } from 'zustand';
import type { Movement, MovementInput, SessionUser, Settings } from '@gastosapp/shared';
import { ApiError, api } from './api';

/**
 * Estado de la app. Los datos viven en el servidor (cuenta de cada persona);
 * este store es la copia en memoria de lo que devolvió la API.
 */
type Status = 'loading' | 'anon' | 'ready' | 'error';

interface Me {
  user: SessionUser;
  settings: Settings;
}

interface State {
  status: Status;
  bootError: string | null;
  user: SessionUser | null;
  settings: Settings | null;
  /** Todos los movimientos, del más nuevo al más viejo */
  movements: Movement[];

  boot: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  addMovement: (m: MovementInput) => Promise<Movement>;
  updateMovement: (id: string, m: MovementInput) => Promise<Movement>;
  deleteMovement: (id: string) => Promise<void>;
  reloadMovements: () => Promise<void>;
  wipeData: () => Promise<void>;
}

const sortMovements = (list: Movement[]) =>
  [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));

export const useStore = create<State>()((set, get) => {
  const enter = async (me: Me) => {
    const movements = await api<Movement[]>('/movements');
    set({ status: 'ready', bootError: null, user: me.user, settings: me.settings, movements: sortMovements(movements) });
  };

  return {
    status: 'loading',
    bootError: null,
    user: null,
    settings: null,
    movements: [],

    boot: async () => {
      set({ status: 'loading', bootError: null });
      try {
        await enter(await api<Me>('/auth/me'));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) set({ status: 'anon' });
        else set({ status: 'error', bootError: err instanceof Error ? err.message : null });
      }
    },

    login: async (username, password) => {
      const me = await api<Me>('/auth/login', { method: 'POST', body: { username, password } });
      await enter(me);
    },

    logout: async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
      } finally {
        set({ status: 'anon', user: null, settings: null, movements: [] });
      }
    },

    saveSettings: async (s) => {
      const saved = await api<Settings>('/settings', { method: 'PUT', body: s });
      set({ settings: saved });
    },

    addMovement: async (m) => {
      const saved = await api<Movement>('/movements', { method: 'POST', body: m });
      set({ movements: sortMovements([saved, ...get().movements]) });
      return saved;
    },

    updateMovement: async (id, m) => {
      const saved = await api<Movement>(`/movements/${id}`, { method: 'PUT', body: m });
      set({ movements: sortMovements(get().movements.map((x) => (x.id === id ? saved : x))) });
      return saved;
    },

    deleteMovement: async (id) => {
      await api(`/movements/${id}`, { method: 'DELETE' });
      set({ movements: get().movements.filter((x) => x.id !== id) });
    },

    reloadMovements: async () => {
      const movements = await api<Movement[]>('/movements');
      set({ movements: sortMovements(movements) });
    },

    wipeData: async () => {
      await api('/me/data', { method: 'DELETE' });
      const me = await api<Me>('/auth/me');
      set({ settings: me.settings, movements: [] });
    },
  };
});

/** Ajustes ya cargados (las pantallas internas solo existen con status "ready"). */
export const useSettings = () => useStore((s) => s.settings!);
