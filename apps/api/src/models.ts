import mongoose, { Schema } from 'mongoose';
import type { Movement } from '@gastosapp/shared';

/* Usuarios: los crea el admin desde el panel. */
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const User = mongoose.model('User', userSchema);

/* Sesiones: el navegador guarda un token al azar en una cookie; acá solo su hash. */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = mongoose.model('Session', sessionSchema);

/* Ajustes: uno por usuario (moneda principal, categorías y presupuestos). Se valida con settingsSchema. */
const settingsDocSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);
export const SettingsDoc = mongoose.model('Settings', settingsDocSchema);

/* Movimientos (gastos, ingresos y transferencias entre cuentas): validados con movementInputSchema antes de guardar. Montos en centavos. */
const movementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['gasto', 'ingreso', 'transferencia'], default: 'gasto' },
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['ARS', 'USD'], default: 'ARS' },
    categoryKey: { type: String, default: '' },
    accountKey: { type: String, default: null },
    toAccountKey: { type: String, default: null },
    toAmount: { type: Number, default: null },
    date: { type: String, required: true },
    description: { type: String, default: '' },
    method: { type: String, default: 'debito' },
    installments: { type: Number, default: 1 },
  },
  { timestamps: true, minimize: false },
);
movementSchema.index({ userId: 1, date: -1 });
export const MovementDoc = mongoose.model('Movement', movementSchema);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toSessionUser(u: any) {
  return { id: String(u._id), username: u.username, displayName: u.displayName, role: u.role };
}

export function toMovement(m: any): Movement {
  return {
    id: String(m._id),
    kind: m.kind,
    amount: m.amount,
    currency: m.currency,
    categoryKey: m.categoryKey ?? '',
    accountKey: m.accountKey ?? null,
    toAccountKey: m.toAccountKey ?? null,
    toAmount: m.toAmount ?? null,
    date: m.date,
    description: m.description ?? '',
    method: m.method,
    installments: m.installments ?? 1,
    createdAt: new Date(m.createdAt).toISOString(),
  };
}
