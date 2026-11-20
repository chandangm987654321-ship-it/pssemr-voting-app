import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pssemrDb } from './src/server/db.ts';
import type { ElectionStatus } from './src/types.ts';

const ADMIN_COOKIE = 'pssemr_admin_session';
const ADMIN_PASSWORD = process.env.PSSEMR_ADMIN_PASSWORD || 'pssemr_admin';
const SESSION_SECRET =
  process.env.PSSEMR_SESSION_SECRET ||
  crypto.createHash('sha256').update(`pssemr-${process.cwd()}-secret`).digest('hex');

const sseClients = new Set<Response>();

function broadcastSync(eventType: string) {
  const payload = JSON.stringify({ type: eventType, ts: Date.now() });
  for (const res of sseClients) {
    try {
      res.write(`event: sync\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function createAdminToken(): string {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const data = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyAdminToken(token: string | null): boolean {
  if (!token) return false;
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return false;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return parsed?.role === 'admin' && typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function extractAdminToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[ADMIN_COOKIE] || null;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractAdminToken(req);
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: 'Administrator authentication required.' });
    return;
  }
  next();
}

function setAdminCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${12 * 60 * 60}`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAdminCookie(res: Response) {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

const UPLOADS_DIR = path.resolve(process.cwd(), '.pssemr-data', 'uploads');
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

async function startServer() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      maxAge: '30d',
      fallthrough: false,
    })
  );
  app.use('/api', (req, res, next) => {
    if (req.path !== '/events') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ---- Real-Time Sync Stream (SSE) ----
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // ---- Voter Panel Endpoints (No Login Required; Never Exposes Vote Counts) ----
  app.get('/api/voter/state', async (req, res) => {
    try {
      const sessionToken = typeof req.query.sessionToken === 'string' ? req.query.sessionToken : undefined;
      const state = await pssemrDb.getVoterState(sessionToken);
      res.json(state);
    } catch (err) {
      console.error('GET /api/voter/state error:', err);
      res.status(500).json({ error: 'Unable to load election candidates.' });
    }
  });

  app.post('/api/voter/vote', async (req, res) => {
    try {
      const { candidateId, sessionToken } = req.body || {};
      if (typeof candidateId !== 'string' || typeof sessionToken !== 'string') {
        res.status(400).json({ error: 'Candidate ID and session token are required.' });
        return;
      }
      const result = await pssemrDb.recordVote(candidateId, sessionToken);
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      broadcastSync('vote_recorded');
      res.status(201).json({ ok: true, candidateName: result.candidateName });
    } catch (err) {
      console.error('POST /api/voter/vote error:', err);
      res.status(500).json({ error: 'Failed to record vote.' });
    }
  });

  // ---- Result Panel Endpoint (No Login Required; Respects Published Visibility) ----
  app.get('/api/results', async (_req, res) => {
    try {
      const results = await pssemrDb.getPublicResults();
      res.json(results);
    } catch (err) {
      console.error('GET /api/results error:', err);
      res.status(500).json({ error: 'Unable to load election results.' });
    }
  });

  // ---- Admin Auth Endpoints ----
  app.get('/api/admin/me', (req, res) => {
    const authenticated = verifyAdminToken(extractAdminToken(req));
    res.json({ authenticated });
  });

  app.post('/api/admin/login', (req, res) => {
    const { password } = req.body || {};
    if (typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'Password is required.' });
      return;
    }
    if (!timingSafeCompare(password, ADMIN_PASSWORD)) {
      res.status(401).json({ error: 'Incorrect administrator password.' });
      return;
    }
    const token = createAdminToken();
    setAdminCookie(res, token);
    res.json({ authenticated: true, token });
  });

  app.post('/api/admin/logout', (_req, res) => {
    clearAdminCookie(res);
    res.json({ ok: true });
  });

  // ---- Protected Admin Endpoints ----
  app.post('/api/admin/upload', requireAdmin, (req, res) => {
    try {
      const { dataUrl, kind } = req.body || {};
      if (typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Image payload is required.' });
        return;
      }
      const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
      if (!match) {
        res.status(400).json({
          error: 'Unsupported image format. Please upload a JPG, JPEG, PNG, or WEBP image.',
        });
        return;
      }
      const mime = match[1].toLowerCase();
      const ext = MIME_TO_EXT[mime];
      if (!ext) {
        res.status(400).json({
          error: 'Unsupported image format. Please upload a JPG, JPEG, PNG, or WEBP image.',
        });
        return;
      }
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
        res.status(400).json({ error: 'Image size must be between 1 byte and 8 MB.' });
        return;
      }

      const prefix = kind === 'symbol' ? 'symbol' : 'photo';
      const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
      const destPath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(destPath, buffer);
      res.status(201).json({ url: `/uploads/${filename}` });
    } catch (err) {
      console.error('POST /api/admin/upload error:', err);
      res.status(500).json({ error: 'Failed to store uploaded image.' });
    }
  });

  app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
    try {
      const data = await pssemrDb.getAdminDashboard();
      res.json(data);
    } catch (err) {
      console.error('GET /api/admin/dashboard error:', err);
      res.status(500).json({ error: 'Failed to load admin dashboard.' });
    }
  });

  app.post('/api/admin/candidates', requireAdmin, async (req, res) => {
    try {
      const outcome = await pssemrDb.createCandidate(req.body || {});
      if (!outcome.ok) {
        res.status(400).json({ error: outcome.error });
        return;
      }
      broadcastSync('candidate_created');
      res.status(201).json(outcome.candidate);
    } catch (err) {
      console.error('POST /api/admin/candidates error:', err);
      res.status(500).json({ error: 'Failed to register candidate.' });
    }
  });

  app.patch('/api/admin/candidates/:id', requireAdmin, async (req, res) => {
    try {
      const outcome = await pssemrDb.updateCandidate(req.params.id, req.body || {});
      if (!outcome.ok) {
        res.status(404).json({ error: outcome.error });
        return;
      }
      broadcastSync('candidate_updated');
      res.json(outcome.candidate);
    } catch (err) {
      console.error('PATCH /api/admin/candidates error:', err);
      res.status(500).json({ error: 'Failed to update candidate.' });
    }
  });

  app.delete('/api/admin/candidates/:id', requireAdmin, async (req, res) => {
    try {
      const confirmed =
        req.query.confirm === 'true' ||
        req.query.confirmPaused === 'true' ||
        Boolean(req.body?.confirm) ||
        Boolean(req.body?.confirmPausedRemoval);
      const outcome = await pssemrDb.removeCandidate(req.params.id, confirmed);
      if (!outcome.ok) {
        res.status(outcome.status).json({ error: outcome.error });
        return;
      }
      broadcastSync('candidate_removed');
      res.json({ ok: true, deletedVotes: outcome.deletedVotes });
    } catch (err) {
      console.error('DELETE /api/admin/candidates error:', err);
      res.status(500).json({ error: 'Failed to remove candidate.' });
    }
  });

  app.post('/api/admin/election/status', requireAdmin, async (req, res) => {
    try {
      const { status, publishResults } = req.body || {};
      const allowed: ElectionStatus[] = ['not_started', 'active', 'paused', 'ended'];
      if (!allowed.includes(status)) {
        res.status(400).json({ error: 'Invalid election status.' });
        return;
      }
      const updated = await pssemrDb.updateElectionStatus(
        status,
        typeof publishResults === 'boolean' ? publishResults : undefined
      );
      broadcastSync('election_status_changed');
      res.json(updated);
    } catch (err) {
      console.error('POST /api/admin/election/status error:', err);
      res.status(500).json({ error: 'Failed to update election status.' });
    }
  });

  app.post('/api/admin/election/settings', requireAdmin, async (req, res) => {
    try {
      const { electionTitle, electionDate, resultsPublished } = req.body || {};
      const updated = await pssemrDb.updateElectionSettings({
        electionTitle: typeof electionTitle === 'string' ? electionTitle : undefined,
        electionDate: typeof electionDate === 'string' ? electionDate : undefined,
        resultsPublished: typeof resultsPublished === 'boolean' ? resultsPublished : undefined,
      });
      broadcastSync('election_settings_changed');
      res.json(updated);
    } catch (err) {
      console.error('POST /api/admin/election/settings error:', err);
      res.status(500).json({ error: 'Failed to update election settings.' });
    }
  });

  // ---- Vite Dev / Static Serving ----
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build missing. Run npm run build.');
      }
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`PSSEMR Digital Voting System listening on http://0.0.0.0:${port}`);
    pssemrDb.init().catch(() => {});
  });
}

startServer();
