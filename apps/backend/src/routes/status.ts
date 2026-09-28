import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import config from '../config';
import { verifyToken } from '../lib/auth';
import { getContainerClient } from '../lib/projectDocumentStorage';

type CheckResult = { name: string; ok: boolean; detail: string; latencyMs: number };

export const statusRateLimitOptions = {
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  message: { message: 'Te veel statusverzoeken. Probeer het later opnieuw.' },
};

const formatError = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const runCheck = async (name: string, probe: () => Promise<string>): Promise<CheckResult> => {
  const start = performance.now();
  try {
    return { name, ok: true, detail: await probe(), latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return { name, ok: false, detail: formatError(error), latencyMs: Math.round(performance.now() - start) };
  }
};

export const statusHandler: RequestHandler = async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !(await verifyToken(`Bearer ${token}`))) {
    res.status(401).json({ message: 'Niet ingelogd.' });
    return;
  }

  const checks = await Promise.all([
    runCheck('cosmos', async () => {
      await mongoose.connection.db?.command({ ping: 1 });
      if (mongoose.connection.readyState !== 1) throw new Error('De databaseverbinding is niet actief');
      return `Database ${mongoose.connection.name} is bereikbaar`;
    }),
    runCheck('storage', async () => {
      await getContainerClient().getProperties();
      return `Container ${config.storage.containerName} is bereikbaar`;
    }),
    runCheck('aiService', async () => {
      const response = await fetch(`${config.aiService.baseUrl.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`De AI-service gaf status ${response.status}`);
      return 'De AI-service is bereikbaar';
    }),
  ]);

  res.json({ status: checks.every(check => check.ok) ? 'ok' : 'degraded', checks });
};
