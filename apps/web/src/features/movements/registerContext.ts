import { createContext, useContext } from 'react';
import type { Kind, Movement } from '@gastosapp/shared';

export type MovementSheetTarget = { mode: 'new'; date?: string; kind?: Kind } | { mode: 'edit'; movement: Movement };

/** Abre la hoja para cargar o editar un movimiento desde cualquier pantalla. */
export const RegisterContext = createContext<(t: MovementSheetTarget) => void>(() => {});
export const useRegister = () => useContext(RegisterContext);
