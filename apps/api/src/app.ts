import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { loadUser } from './auth';
import { errorHandler, notFound } from './middleware/errors';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Detrás de dos nginx (el del VPS y el del contenedor web): confiamos en proxies de red local
  // para leer la IP real en el freno de intentos de login.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.use(helmet());
  // Importar un respaldo o mandar la foto de un ticket es pesado; el resto de los pedidos es chico.
  const bigJson = express.json({ limit: '5mb' });
  const smallJson = express.json({ limit: '200kb' });
  app.use((req, res, next) => (req.path === '/api/v1/me/import' || req.path === '/api/v1/ai/ticket' ? bigJson(req, res, next) : smallJson(req, res, next)));
  app.use(cookieParser());
  app.use(loadUser);

  app.use('/api/v1', apiRouter());
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
