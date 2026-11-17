import type { MovementDraft, Settings } from '@gastosapp/shared';
import { env } from './config/env';

/**
 * Carga asistida con Claude (API de Anthropic): de un texto ("café 2500 mp") o de la foto de un
 * ticket arma un borrador de movimiento. La clave vive solo en el servidor. No se guarda ni el
 * texto ni la foto: se procesan y se descartan. Siempre lo confirma la persona.
 */

export class AiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

const METHODS = ['efectivo', 'debito', 'credito', 'transferencia', 'otro'] as const;

function tool(settings: Settings) {
  const cats = settings.categories.filter((c) => !c.archived).map((c) => c.key);
  const accs = settings.accounts.filter((a) => !a.archived).map((a) => a.key);
  return {
    name: 'registrar_movimiento',
    description: 'Registra el movimiento de plata identificado.',
    input_schema: {
      type: 'object',
      properties: {
        se_entiende: { type: 'boolean', description: 'Hay un gasto, ingreso o transferencia identificable' },
        tipo: { type: 'string', enum: ['gasto', 'ingreso', 'transferencia'] },
        monto: { type: 'number', description: 'Monto total, en unidades (no centavos). Ej.: 2500 o 12500.5. "40 mil" = 40000, "2 lucas" = 2000' },
        moneda: { type: 'string', enum: ['ARS', 'USD'] },
        categoria: { type: 'string', enum: [...cats, ''], description: 'Clave de la categoría; vacío si es transferencia o no se sabe' },
        cuenta: { type: 'string', enum: [...accs, ''], description: 'Cuenta de donde sale (o a donde entra si es ingreso); vacío si no se menciona' },
        cuenta_destino: { type: 'string', enum: [...accs, ''], description: 'Solo transferencias: a qué cuenta entra' },
        descripcion: { type: 'string', description: 'Detalle corto, máximo 60 caracteres (comercio o concepto)' },
        fecha: { type: 'string', description: 'YYYY-MM-DD. "ayer", "el lunes" se calculan desde hoy' },
        medio: { type: 'string', enum: [...METHODS] },
        cuotas: { type: 'integer', minimum: 1, maximum: 60 },
        aviso: { type: 'string', description: 'Si algo no quedó claro, una oración corta. Si no, vacío' },
      },
      required: ['se_entiende', 'tipo', 'monto', 'categoria', 'cuenta', 'descripcion', 'fecha'],
    },
  } as const;
}

function system(settings: Settings, today: string, source: 'texto' | 'ticket') {
  const cats = settings.categories
    .filter((c) => !c.archived)
    .map((c) => `- ${c.key}: ${c.name} (${c.kind})`)
    .join('\n');
  const accs = settings.accounts
    .filter((a) => !a.archived)
    .map((a) => `- ${a.key}: ${a.name} (${a.currency}${a.type === 'tarjeta' ? ', tarjeta de crédito' : ''})`)
    .join('\n');
  return `Ayudás a una app argentina de control de gastos a cargar un movimiento ${source === 'texto' ? 'a partir de un texto corto que escribió la persona' : 'a partir de la foto de un ticket o comprobante'}.
Hoy es ${today}. La moneda principal es ${settings.currency}.

Categorías (clave: nombre (tipo)):
${cats}

Cuentas (clave: nombre (moneda)):
${accs}

Reglas:
- Elegí siempre claves de las listas. Abreviaturas comunes: "mp" o "mercado" = Mercado Pago, "efe" = efectivo, "gali" = Galicia.
- Si menciona una tarjeta de crédito o cuotas, el medio es "credito". Si la cuenta elegida es una tarjeta, el medio es "credito".
- "Pasé", "transferí", "saqué del cajero", "compré dólares" entre cuentas propias es una transferencia (sin categoría).
- Cobros, sueldo, reintegros son ingresos.
- Si no se menciona la fecha, usá hoy. En un ticket, usá la fecha impresa.
- En un ticket, el monto es el TOTAL final pagado y la descripción es el nombre del comercio.
- Si no dice moneda, es ${settings.currency}, salvo que la cuenta sea en otra moneda.
Respondé solo usando la herramienta registrar_movimiento.`;
}

async function callClaude(sys: string, t: ReturnType<typeof tool>, content: unknown[]): Promise<{ input: Record<string, unknown>; usage: Usage }> {
  if (!env.ANTHROPIC_API_KEY) throw new AiError(503, 'Esta función todavía no está configurada.');
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.AI_MODEL,
        max_tokens: 600,
        system: sys,
        tools: [t],
        tool_choice: { type: 'tool', name: t.name },
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(40_000),
    });
  } catch (err) {
    console.error('[ia] sin respuesta de Anthropic:', (err as Error).message);
    throw new AiError(502, 'No pudimos conectarnos ahora. Probá de nuevo en un ratito.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[ia] Anthropic ${res.status}: ${body.slice(0, 500)}`);
    if (res.status === 429 || res.status === 529) throw new AiError(503, 'Está todo un poco ocupado. Probá de nuevo en un ratito.');
    throw new AiError(502, 'No pudimos resolverlo ahora. Probá de nuevo en un ratito.');
  }
  const data = (await res.json()) as {
    content?: { type: string; name?: string; input?: Record<string, unknown> }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const input = data.content?.find((c) => c.type === 'tool_use' && c.name === t.name)?.input;
  if (!input) throw new AiError(502, 'No pudimos leer la respuesta. Probá de nuevo.');
  return { input, usage: { inputTokens: data.usage?.input_tokens ?? 0, outputTokens: data.usage?.output_tokens ?? 0 } };
}

const str = (v: unknown, max = 60) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Valida lo que devolvió el modelo contra los ajustes de la persona: nada inventado pasa. */
function toDraft(raw: Record<string, unknown>, settings: Settings, today: string): MovementDraft {
  if (raw.se_entiende === false) throw new AiError(422, 'No encontramos un gasto ahí. Probá escribirlo de otra forma o cargalo a mano.');
  const kind = raw.tipo === 'ingreso' || raw.tipo === 'transferencia' ? raw.tipo : 'gasto';
  const monto = typeof raw.monto === 'number' && Number.isFinite(raw.monto) && raw.monto > 0 ? Math.round(raw.monto * 100) : null;
  const catKey = str(raw.categoria, 40);
  const category = settings.categories.find((c) => c.key === catKey && c.kind === kind && !c.archived);
  const accountOk = (k: string) => settings.accounts.some((a) => a.key === k && !a.archived);
  const accountKey = accountOk(str(raw.cuenta, 40)) ? str(raw.cuenta, 40) : null;
  const toAccountKey = kind === 'transferencia' && accountOk(str(raw.cuenta_destino, 40)) ? str(raw.cuenta_destino, 40) : null;
  const account = settings.accounts.find((a) => a.key === accountKey);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(raw.fecha, 10)) && str(raw.fecha, 10) <= today ? str(raw.fecha, 10) : today;
  const method = account?.type === 'tarjeta' ? 'credito' : (METHODS as readonly string[]).includes(raw.medio as string) ? (raw.medio as MovementDraft['method']) : null;
  const cuotas = typeof raw.cuotas === 'number' && raw.cuotas >= 1 && raw.cuotas <= 60 ? Math.round(raw.cuotas) : 1;
  return {
    kind,
    amount: monto,
    currency: account?.currency ?? (raw.moneda === 'USD' || raw.moneda === 'ARS' ? raw.moneda : null),
    categoryKey: kind === 'transferencia' ? null : (category?.key ?? null),
    accountKey,
    toAccountKey,
    description: str(raw.descripcion),
    date,
    method,
    installments: method === 'credito' ? cuotas : 1,
    note: str(raw.aviso, 160),
  };
}

export async function parseText(text: string, settings: Settings, today: string) {
  const t = tool(settings);
  const { input, usage } = await callClaude(system(settings, today, 'texto'), t, [{ type: 'text', text }]);
  return { draft: toDraft(input, settings, today), usage };
}

export async function parseTicket(image: string, mediaType: string, settings: Settings, today: string) {
  const t = tool(settings);
  const { input, usage } = await callClaude(system(settings, today, 'ticket'), t, [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
    { type: 'text', text: 'Este es el ticket o comprobante.' },
  ]);
  return { draft: toDraft(input, settings, today), usage };
}

/* ---------- cotización del dólar (dolarapi.com), con caché ---------- */

type RateRow = { compra: number | null; venta: number | null };
let cache: { at: number; data: { rates: Record<string, RateRow>; updatedAt: string | null } } | null = null;
const TTL = 15 * 60 * 1000;
const WANTED = ['oficial', 'blue', 'bolsa', 'tarjeta'];

export async function dollarRates() {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = (await res.json()) as { casa?: string; compra?: number; venta?: number; fechaActualizacion?: string }[];
    const rates: Record<string, RateRow> = {};
    let updatedAt: string | null = null;
    for (const r of list) {
      if (!r.casa || !WANTED.includes(r.casa)) continue;
      rates[r.casa] = { compra: typeof r.compra === 'number' ? r.compra : null, venta: typeof r.venta === 'number' ? r.venta : null };
      if (r.fechaActualizacion && (!updatedAt || r.fechaActualizacion > updatedAt)) updatedAt = r.fechaActualizacion;
    }
    cache = { at: Date.now(), data: { rates, updatedAt } };
    return cache.data;
  } catch (err) {
    console.warn('[dolar] no pude actualizar la cotización:', (err as Error).message);
    if (cache) return cache.data; // mejor una cotización de hace un rato que ninguna
    return { rates: {}, updatedAt: null };
  }
}
