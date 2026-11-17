import { Router, type NextFunction, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  changePasswordSchema,
  createUserSchema,
  defaultSettings,
  loginSchema,
  movementInputSchema,
  settingsSchema,
  updateUserSchema,
} from '@gastosapp/shared';
import {
  endAllSessions,
  endSession,
  hashPassword,
  loginBlocked,
  loginFailed,
  loginOk,
  requireAdmin,
  requireUser,
  startSession,
  verifyPassword,
} from './auth';
import { dbReady } from './config/db';
import { MovementDoc, SettingsDoc, User, toMovement, toSessionUser } from './models';

type Handler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  fn(req, res).catch(next);
};

const oid = (id: string) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null);

/** Ajustes de la persona; si todavía no tiene, arranca con las categorías por defecto. */
async function settingsOf(userId: string) {
  const doc = await SettingsDoc.findOne({ userId }).lean();
  const parsed = settingsSchema.safeParse(doc?.data);
  return parsed.success ? parsed.data : defaultSettings();
}

const importSchema = z.object({ movements: z.array(movementInputSchema).max(20000) });

export function apiRouter(): Router {
  const r = Router();

  r.get('/health', (_req, res) => {
    res.json({ ok: true, db: dbReady() ? 'up' : 'down' });
  });

  /* ---------------- auth ---------------- */

  r.post(
    '/auth/login',
    h(async (req, res) => {
      const key = req.ip ?? 'desconocido';
      if (loginBlocked(key)) {
        res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en 15 minutos.' });
        return;
      }
      const parsed = loginSchema.safeParse(req.body);
      const user = parsed.success ? await User.findOne({ username: parsed.data.username }) : null;
      const ok = !!user && user.active && parsed.success && (await verifyPassword(parsed.data.password, user.passwordHash));
      if (!ok || !user) {
        loginFailed(key);
        res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        return;
      }
      loginOk(key);
      await startSession(res, String(user._id));
      res.json({ user: toSessionUser(user), settings: await settingsOf(String(user._id)) });
    }),
  );

  r.post(
    '/auth/logout',
    h(async (req, res) => {
      await endSession(req, res);
      res.status(204).end();
    }),
  );

  r.get(
    '/auth/me',
    requireUser,
    h(async (req, res) => {
      res.json({ user: req.user, settings: await settingsOf(req.user!.id) });
    }),
  );

  r.put(
    '/auth/password',
    requireUser,
    h(async (req, res) => {
      const data = changePasswordSchema.parse(req.body);
      const u = await User.findById(req.user!.id);
      if (!u || !(await verifyPassword(data.current, u.passwordHash))) {
        res.status(400).json({ error: 'La contraseña actual no es correcta' });
        return;
      }
      u.passwordHash = await hashPassword(data.next);
      await u.save();
      res.status(204).end();
    }),
  );

  /* ---------------- ajustes (categorías, presupuestos, moneda) ---------------- */

  r.put(
    '/settings',
    requireUser,
    h(async (req, res) => {
      const data = settingsSchema.parse(req.body);
      await SettingsDoc.updateOne({ userId: req.user!.id }, { $set: { data } }, { upsert: true });
      res.json(data);
    }),
  );

  /* ---------------- movimientos ---------------- */

  r.get(
    '/movements',
    requireUser,
    h(async (req, res) => {
      const docs = await MovementDoc.find({ userId: req.user!.id }).sort({ date: -1, createdAt: -1 }).limit(20000).lean();
      res.json(docs.map(toMovement));
    }),
  );

  r.post(
    '/movements',
    requireUser,
    h(async (req, res) => {
      const data = movementInputSchema.parse(req.body);
      const doc = await MovementDoc.create({ ...data, userId: req.user!.id });
      res.status(201).json(toMovement(doc.toObject()));
    }),
  );

  r.put(
    '/movements/:id',
    requireUser,
    h(async (req, res) => {
      const id = oid(req.params.id!);
      const data = movementInputSchema.parse(req.body);
      const doc = id ? await MovementDoc.findOneAndUpdate({ _id: id, userId: req.user!.id }, { $set: data }, { new: true }).lean() : null;
      if (!doc) {
        res.status(404).json({ error: 'No encontramos ese movimiento' });
        return;
      }
      res.json(toMovement(doc));
    }),
  );

  r.delete(
    '/movements/:id',
    requireUser,
    h(async (req, res) => {
      const id = oid(req.params.id!);
      if (id) await MovementDoc.deleteOne({ _id: id, userId: req.user!.id });
      res.status(204).end();
    }),
  );

  /* ---------------- mis datos: exportar, importar y borrar ---------------- */

  r.get(
    '/me/export',
    requireUser,
    h(async (req, res) => {
      const [settings, docs] = await Promise.all([settingsOf(req.user!.id), MovementDoc.find({ userId: req.user!.id }).sort({ date: 1 }).lean()]);
      res.json({ app: 'gastosapp', version: 1, exportedAt: new Date().toISOString(), settings, movements: docs.map(toMovement) });
    }),
  );

  r.post(
    '/me/import',
    requireUser,
    h(async (req, res) => {
      const { movements } = importSchema.parse(req.body);
      if (movements.length) await MovementDoc.insertMany(movements.map((m) => ({ ...m, userId: req.user!.id })));
      res.json({ imported: movements.length });
    }),
  );

  r.delete(
    '/me/data',
    requireUser,
    h(async (req, res) => {
      await Promise.all([MovementDoc.deleteMany({ userId: req.user!.id }), SettingsDoc.deleteOne({ userId: req.user!.id })]);
      res.status(204).end();
    }),
  );

  /* ---------------- admin: usuarios ---------------- */

  r.get(
    '/admin/users',
    requireAdmin,
    h(async (_req, res) => {
      const users = await User.find().sort({ createdAt: 1 }).lean();
      const ids = users.map((u) => u._id);
      const stats = await MovementDoc.aggregate<{ _id: Types.ObjectId; count: number; last: Date }>([
        { $match: { userId: { $in: ids } } },
        { $group: { _id: '$userId', count: { $sum: 1 }, last: { $max: '$createdAt' } } },
      ]);
      const byUser = new Map(stats.map((s) => [String(s._id), s]));
      res.json(
        users.map((u) => {
          const s = byUser.get(String(u._id));
          return {
            ...toSessionUser(u),
            active: u.active,
            movementCount: s?.count ?? 0,
            lastMovementAt: s?.last ? new Date(s.last).toISOString() : null,
            createdAt: new Date(u.createdAt).toISOString(),
          };
        }),
      );
    }),
  );

  r.post(
    '/admin/users',
    requireAdmin,
    h(async (req, res) => {
      const data = createUserSchema.parse(req.body);
      if (await User.exists({ username: data.username })) {
        res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
        return;
      }
      const u = await User.create({
        username: data.username,
        displayName: data.displayName,
        role: data.role,
        passwordHash: await hashPassword(data.password),
      });
      res.status(201).json(toSessionUser(u));
    }),
  );

  r.patch(
    '/admin/users/:id',
    requireAdmin,
    h(async (req, res) => {
      const id = oid(req.params.id!);
      const data = updateUserSchema.parse(req.body);
      const u = id ? await User.findById(id) : null;
      if (!u) {
        res.status(404).json({ error: 'No encontramos ese usuario' });
        return;
      }
      if (data.active === false && String(u._id) === req.user!.id) {
        res.status(400).json({ error: 'No podés desactivar tu propia cuenta' });
        return;
      }
      if (data.displayName) u.displayName = data.displayName;
      if (typeof data.active === 'boolean') u.active = data.active;
      if (data.password) u.passwordHash = await hashPassword(data.password);
      await u.save();
      // Cambio de contraseña o desactivación: cierra las sesiones abiertas de esa cuenta (menos la propia).
      if ((data.password || data.active === false) && String(u._id) !== req.user!.id) await endAllSessions(String(u._id));
      res.json(toSessionUser(u));
    }),
  );

  r.delete(
    '/admin/users/:id',
    requireAdmin,
    h(async (req, res) => {
      const id = oid(req.params.id!);
      if (!id) {
        res.status(404).json({ error: 'No encontramos ese usuario' });
        return;
      }
      if (String(id) === req.user!.id) {
        res.status(400).json({ error: 'No podés borrar tu propia cuenta' });
        return;
      }
      await Promise.all([
        MovementDoc.deleteMany({ userId: id }),
        SettingsDoc.deleteOne({ userId: id }),
        endAllSessions(String(id)),
        User.deleteOne({ _id: id }),
      ]);
      res.status(204).end();
    }),
  );

  return r;
}
