import { createContext, useContext } from 'react';
import type { Method, Movement, MovementKind, Split } from '@gastosapp/shared';

/** Campos para arrancar la hoja ya completa (fijos, saldar con una persona, pagar la tarjeta). */
export interface MovementPrefill {
  kind?: MovementKind;
  amount?: number | null;
  categoryKey?: string | null;
  accountKey?: string | null;
  toAccountKey?: string | null;
  description?: string;
  date?: string | null;
  method?: Method | null;
  installments?: number;
  recurringKey?: string | null;
  split?: Split | null;
  personKey?: string | null;
}

export type MovementSheetTarget = { mode: 'new'; date?: string; kind?: MovementKind; accountKey?: string; prefill?: MovementPrefill } | { mode: 'edit'; movement: Movement };

/** Abre la hoja para cargar o editar un movimiento desde cualquier pantalla. */
export const RegisterContext = createContext<(t: MovementSheetTarget) => void>(() => {});
export const useRegister = () => useContext(RegisterContext);
