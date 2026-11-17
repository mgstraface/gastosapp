import { z } from 'zod';
import type { Method, MovementKind } from './movement';
import type { Currency } from './money';

/** Lo que propone la IA a partir de un texto o de la foto de un ticket. Siempre se confirma a mano. */
export interface MovementDraft {
  kind: MovementKind;
  /** Centavos, o null si no se pudo leer */
  amount: number | null;
  currency: Currency | null;
  categoryKey: string | null;
  accountKey: string | null;
  toAccountKey: string | null;
  description: string;
  date: string | null;
  method: Method | null;
  installments: number;
  /** Aviso corto si algo no quedó claro */
  note: string;
}

export const parseTextSchema = z.object({ text: z.string().trim().min(1).max(300), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export const ticketSchema = z.object({
  image: z.string().min(100).max(4_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface AiStatus {
  enabled: boolean;
  remaining: number;
}
