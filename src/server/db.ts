import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { Pool as PgPool } from 'pg';
import type {
  AdminDashboardResponse,
  Candidate,
  CandidateVoteResult,
  ElectionStatus,
  PublicResultsResponse,
  VoterStateResponse,
} from '../types.ts';

interface LocalCandidateRow {
  id: string;
  name: string;
  class_section: string;
  designation?: string;
  photo_url: string;
  symbol: string;
  symbol_logo_url?: string;
  created_at: string;
  is_active: boolean;
}

interface LocalVoteRow {
  id: string;
  candidate_id: string;
  created_at: string;
  session_token: string;
}

interface LocalSettingsRow {
  id: number;
  election_status: ElectionStatus;
  election_title?: string;
  election_date?: string;
  results_published?: boolean;
  updated_at: string;
}

interface LocalDbSchema {
  candidates: LocalCandidateRow[];
  votes: LocalVoteRow[];
  election_settings: LocalSettingsRow;
}

interface QueryableClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

interface QueryablePool {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  connect(): Promise<QueryableClient>;
  end(): Promise<void>;
}

const DATA_DIR = path.resolve(process.cwd(), '.pssemr-data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function sanitizeConnectionString(raw: string): string {
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    // Remove channel_binding which can cause TLS/SCRAM handshake failures in JS drivers
    url.searchParams.delete('channel_binding');
    return url.toString();
  } catch {
    return trimmed;
  }
}

function mapCandidate(row: LocalCandidateRow): Candidate {
  return {
    id: row.id,
    name: row.name,
    classSection: row.class_section,
    designation: row.designation || '',
    photoUrl: row.photo_url,
    symbol: row.symbol,
    symbolLogoUrl: row.symbol_logo_url || '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    isActive: Boolean(row.is_active),
  };
}

class PssemrDatabase {
  private pool: QueryablePool | null = null;
  private localDb: LocalDbSchema | null = null;
  private initPromise: Promise<void> | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async ensureSchema(pool: QueryablePool): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        class_section TEXT NOT NULL DEFAULT '',
        designation TEXT NOT NULL DEFAULT '',
        photo_url TEXT NOT NULL DEFAULT '',
        symbol TEXT NOT NULL DEFAULT '',
        symbol_logo_url TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);

    await pool.query(`
      ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS symbol_logo_url TEXT NOT NULL DEFAULT '';
    `);

    await pool.query(`
      ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT '';
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        candidate_id TEXT NOT NULL REFERENCES candidates(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        session_token TEXT NOT NULL UNIQUE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS election_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        election_status TEXT NOT NULL DEFAULT 'not_started',
        election_title TEXT NOT NULL DEFAULT 'Student Council Election',
        election_date TEXT NOT NULL DEFAULT '',
        results_published BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE election_settings
      ADD COLUMN IF NOT EXISTS election_title TEXT NOT NULL DEFAULT 'Student Council Election';
    `);
    await pool.query(`
      ALTER TABLE election_settings
      ADD COLUMN IF NOT EXISTS election_date TEXT NOT NULL DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE election_settings
      ADD COLUMN IF NOT EXISTS results_published BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await pool.query(`
      INSERT INTO election_settings (id, election_status, election_title, election_date, results_published, updated_at)
      VALUES (1, 'not_started', 'Student Council Election', TO_CHAR(NOW(), 'YYYY-MM-DD'), FALSE, NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    // Clean up any previously soft-deleted candidates and orphaned votes
    await pool.query(`
      DELETE FROM votes
      WHERE candidate_id IN (SELECT id FROM candidates WHERE is_active = FALSE);
    `);
    await pool.query(`
      DELETE FROM candidates WHERE is_active = FALSE;
    `);
  }

  private async doInit(): Promise<void> {
    const rawConn = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
    const connStr = sanitizeConnectionString(rawConn);

    if (connStr) {
      const isNeonHost = connStr.includes('neon.tech');

      // 1. Try Neon serverless WebSocket pool (port 443 WSS, immune to port 5432 egress blocks)
      if (isNeonHost && typeof globalThis.WebSocket === 'function') {
        neonConfig.webSocketConstructor = globalThis.WebSocket;
        const neonPool = new NeonPool({
          connectionString: connStr,
          max: 10,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
        });
        neonPool.on('error', () => {
          // Prevent unhandled pool-level idle client disconnect errors
        });
        const wrapped = neonPool as unknown as QueryablePool;
        try {
          await this.ensureSchema(wrapped);
          this.pool = wrapped;
          this.initialized = true;
          console.log('Connected to Neon PostgreSQL via serverless WebSocket pool.');
          return;
        } catch (err) {
          await neonPool.end().catch(() => {});
          console.warn(
            'Neon WebSocket connection unavailable, trying TCP pool:',
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      // 2. Try standard pg TCP pool with SSL
      const pgPool = new PgPool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
      });
      pgPool.on('error', () => {
        // Prevent unhandled idle error events when Neon scales to zero
      });

      const wrappedPg = pgPool as unknown as QueryablePool;
      try {
        await this.ensureSchema(wrappedPg);
        this.pool = wrappedPg;
        this.initialized = true;
        console.log('Connected to PostgreSQL database.');
        return;
      } catch (err) {
        await pgPool.end().catch(() => {});
        console.warn(
          'PostgreSQL database unreachable from runtime; using local persistent store:',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    this.localDb = this.loadLocalFile();
    this.initialized = true;
  }

  private loadLocalFile(): LocalDbSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as LocalDbSchema;
        if (parsed && Array.isArray(parsed.candidates) && Array.isArray(parsed.votes) && parsed.election_settings) {
          const activeIds = new Set(parsed.candidates.filter((c) => c.is_active).map((c) => c.id));
          const cleanedCandidates = parsed.candidates
            .filter((c) => activeIds.has(c.id))
            .map((c) => ({
              ...c,
              designation: c.designation || '',
              symbol_logo_url: c.symbol_logo_url || '',
            }));
          const cleanedVotes = parsed.votes.filter((v) => activeIds.has(v.candidate_id));
          const normalizedSettings: LocalSettingsRow = {
            ...parsed.election_settings,
            election_title: parsed.election_settings.election_title || 'Student Council Election',
            election_date:
              parsed.election_settings.election_date ||
              new Date(parsed.election_settings.updated_at || Date.now()).toISOString().slice(0, 10),
            results_published:
              typeof parsed.election_settings.results_published === 'boolean'
                ? parsed.election_settings.results_published
                : false,
          };
          const needsMigration = parsed.candidates.some(
            (c) => c.symbol_logo_url === undefined || c.designation === undefined
          );
          if (
            needsMigration ||
            cleanedCandidates.length !== parsed.candidates.length ||
            cleanedVotes.length !== parsed.votes.length ||
            normalizedSettings.election_title !== parsed.election_settings.election_title ||
            normalizedSettings.election_date !== parsed.election_settings.election_date ||
            normalizedSettings.results_published !== parsed.election_settings.results_published
          ) {
            const cleaned: LocalDbSchema = {
              ...parsed,
              candidates: cleanedCandidates,
              votes: cleanedVotes,
              election_settings: normalizedSettings,
            };
            this.persistLocal(cleaned);
            return cleaned;
          }
          return parsed;
        }
      }
    } catch {
      // Initialize fresh file below
    }

    const nowIso = new Date().toISOString();
    const fresh: LocalDbSchema = {
      candidates: [],
      votes: [],
      election_settings: {
        id: 1,
        election_status: 'not_started',
        election_title: 'Student Council Election',
        election_date: nowIso.slice(0, 10),
        results_published: false,
        updated_at: nowIso,
      },
    };
    this.persistLocal(fresh);
    return fresh;
  }

  private persistLocal(data: LocalDbSchema) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  }

  // ---- Voter Panel State ----
  async getVoterState(sessionToken?: string): Promise<VoterStateResponse> {
    await this.init();

    if (this.pool) {
      const [settingsRes, candRes, voteCheckRes] = await Promise.all([
        this.pool.query<LocalSettingsRow>('SELECT id, election_status, updated_at FROM election_settings WHERE id = 1'),
        this.pool.query<LocalCandidateRow>(
          'SELECT id, name, class_section, designation, photo_url, symbol, symbol_logo_url, created_at, is_active FROM candidates WHERE is_active = TRUE ORDER BY created_at ASC'
        ),
        sessionToken
          ? this.pool.query('SELECT 1 FROM votes WHERE session_token = $1 LIMIT 1', [sessionToken])
          : Promise.resolve({ rows: [] }),
      ]);

      const settings = settingsRes.rows[0];
      return {
        electionStatus: (settings?.election_status as ElectionStatus) || 'not_started',
        updatedAt: settings?.updated_at ? new Date(settings.updated_at).toISOString() : new Date().toISOString(),
        candidates: candRes.rows.map(mapCandidate),
        hasVotedInSession: voteCheckRes.rows.length > 0,
      };
    }

    const db = this.localDb!;
    const hasVotedInSession = Boolean(
      sessionToken && db.votes.some((v) => v.session_token === sessionToken)
    );
    return {
      electionStatus: db.election_settings.election_status,
      updatedAt: db.election_settings.updated_at,
      candidates: db.candidates.filter((c) => c.is_active).map(mapCandidate),
      hasVotedInSession,
    };
  }

  // ---- Record Vote (Transactional) ----
  async recordVote(
    candidateId: string,
    sessionToken: string
  ): Promise<{ ok: true; candidateName: string } | { ok: false; error: string; status: number }> {
    await this.init();

    if (!candidateId || !sessionToken || sessionToken.length < 8) {
      return { ok: false, error: 'Valid candidate and voting session token are required.', status: 400 };
    }

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        const settingsRes = await client.query<LocalSettingsRow>(
          'SELECT election_status FROM election_settings WHERE id = 1 FOR UPDATE'
        );
        const status = (settingsRes.rows[0]?.election_status as ElectionStatus) || 'not_started';
        if (status !== 'active') {
          await client.query('ROLLBACK');
          return {
            ok: false,
            error:
              status === 'ended'
                ? 'Voting has ended.'
                : status === 'paused'
                  ? 'Voting is currently paused by the administrator.'
                  : 'Voting has not started yet.',
            status: 403,
          };
        }

        const candRes = await client.query<LocalCandidateRow>(
          'SELECT id, name, is_active FROM candidates WHERE id = $1',
          [candidateId]
        );
        const candidate = candRes.rows[0];
        if (!candidate || !candidate.is_active) {
          await client.query('ROLLBACK');
          return { ok: false, error: 'Selected candidate is not available for voting.', status: 404 };
        }

        const existing = await client.query('SELECT 1 FROM votes WHERE session_token = $1 LIMIT 1', [
          sessionToken,
        ]);
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return {
            ok: false,
            error: 'A vote has already been submitted in this session.',
            status: 409,
          };
        }

        const voteId = `vot_${crypto.randomBytes(6).toString('hex')}`;
        await client.query(
          'INSERT INTO votes (id, candidate_id, created_at, session_token) VALUES ($1, $2, NOW(), $3)',
          [voteId, candidateId, sessionToken]
        );

        await client.query('COMMIT');
        return { ok: true, candidateName: candidate.name };
      } catch (err: unknown) {
        await client.query('ROLLBACK').catch(() => {});
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          return { ok: false, error: 'A vote has already been submitted in this session.', status: 409 };
        }
        return { ok: false, error: 'Failed to record vote.', status: 500 };
      } finally {
        client.release();
      }
    }

    const db = this.localDb!;
    const status = db.election_settings.election_status;
    if (status !== 'active') {
      return {
        ok: false,
        error:
          status === 'ended'
            ? 'Voting has ended.'
            : status === 'paused'
              ? 'Voting is currently paused by the administrator.'
              : 'Voting has not started yet.',
        status: 403,
      };
    }

    const candidate = db.candidates.find((c) => c.id === candidateId && c.is_active);
    if (!candidate) {
      return { ok: false, error: 'Selected candidate is not available for voting.', status: 404 };
    }

    if (db.votes.some((v) => v.session_token === sessionToken)) {
      return {
        ok: false,
        error: 'A vote has already been submitted in this session.',
        status: 409,
      };
    }

    db.votes.push({
      id: `vot_${crypto.randomBytes(6).toString('hex')}`,
      candidate_id: candidateId,
      created_at: new Date().toISOString(),
      session_token: sessionToken,
    });
    this.persistLocal(db);
    return { ok: true, candidateName: candidate.name };
  }

  // ---- Admin Dashboard & Results ----
  async getAdminDashboard(): Promise<AdminDashboardResponse> {
    await this.init();

    let electionStatus: ElectionStatus = 'not_started';
    let electionTitle = 'Student Council Election';
    let electionDate = new Date().toISOString().slice(0, 10);
    let resultsPublished = false;
    let updatedAt = new Date().toISOString();
    let candidateRows: LocalCandidateRow[] = [];
    const voteCounts = new Map<string, number>();
    let totalVotes = 0;

    if (this.pool) {
      const [settingsRes, candRes, countsRes] = await Promise.all([
        this.pool.query<LocalSettingsRow>(
          'SELECT id, election_status, election_title, election_date, results_published, updated_at FROM election_settings WHERE id = 1'
        ),
        this.pool.query<LocalCandidateRow>(
          'SELECT id, name, class_section, designation, photo_url, symbol, symbol_logo_url, created_at, is_active FROM candidates WHERE is_active = TRUE ORDER BY created_at ASC'
        ),
        this.pool.query<{ candidate_id: string; count: string }>(
          `SELECT v.candidate_id, COUNT(*)::text AS count
           FROM votes v
           INNER JOIN candidates c ON c.id = v.candidate_id
           WHERE c.is_active = TRUE
           GROUP BY v.candidate_id`
        ),
      ]);

      const settings = settingsRes.rows[0];
      electionStatus = (settings?.election_status as ElectionStatus) || 'not_started';
      electionTitle = settings?.election_title || 'Student Council Election';
      updatedAt = settings?.updated_at ? new Date(settings.updated_at).toISOString() : updatedAt;
      electionDate = settings?.election_date || updatedAt.slice(0, 10);
      resultsPublished = Boolean(settings?.results_published);
      candidateRows = candRes.rows;

      for (const row of countsRes.rows) {
        const countNum = Number(row.count) || 0;
        voteCounts.set(row.candidate_id, countNum);
        totalVotes += countNum;
      }
    } else {
      const db = this.localDb!;
      electionStatus = db.election_settings.election_status;
      electionTitle = db.election_settings.election_title || 'Student Council Election';
      updatedAt = db.election_settings.updated_at;
      electionDate = db.election_settings.election_date || updatedAt.slice(0, 10);
      resultsPublished = Boolean(db.election_settings.results_published);
      candidateRows = db.candidates.filter((c) => c.is_active);
      const activeIds = new Set(candidateRows.map((c) => c.id));
      for (const v of db.votes) {
        if (activeIds.has(v.candidate_id)) {
          voteCounts.set(v.candidate_id, (voteCounts.get(v.candidate_id) || 0) + 1);
          totalVotes += 1;
        }
      }
    }

    const candidates = candidateRows.map(mapCandidate);
    const activeList = candidates.filter((c) => c.isActive);

    const results: CandidateVoteResult[] = activeList
      .map((c) => {
        const votes = voteCounts.get(c.id) || 0;
        return {
          candidateId: c.id,
          name: c.name,
          classSection: c.classSection,
          designation: c.designation,
          photoUrl: c.photoUrl,
          symbol: c.symbol,
          symbolLogoUrl: c.symbolLogoUrl,
          isActive: c.isActive,
          votes,
          percentage: totalVotes > 0 ? Number(((votes / totalVotes) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.votes - a.votes);

    const topVotes = results[0]?.votes ?? 0;
    const leaders = results.filter((r) => r.votes === topVotes && topVotes > 0);
    const isTie = leaders.length > 1;
    const leadingCandidate = !isTie && leaders.length === 1 ? leaders[0] : null;
    const tiedCandidates = isTie ? leaders : [];

    return {
      electionTitle,
      electionDate,
      resultsPublished,
      electionStatus,
      updatedAt,
      totalCandidates: candidates.length,
      activeCandidates: activeList.length,
      totalVotes,
      leadingCandidate,
      tiedCandidates,
      isTie,
      candidates: activeList,
      results,
    };
  }

  async getPublicResults(): Promise<PublicResultsResponse> {
    const data = await this.getAdminDashboard();
    if (!data.resultsPublished) {
      return {
        schoolName: 'PSSEMR SCHOOL',
        electionTitle: data.electionTitle,
        electionDate: data.electionDate,
        electionStatus: data.electionStatus,
        updatedAt: data.updatedAt,
        resultsPublished: false,
        totalCandidates: data.activeCandidates,
        totalVotes: 0,
        leadingCandidate: null,
        tiedCandidates: [],
        isTie: false,
        results: [],
      };
    }

    return {
      schoolName: 'PSSEMR SCHOOL',
      electionTitle: data.electionTitle,
      electionDate: data.electionDate,
      electionStatus: data.electionStatus,
      updatedAt: data.updatedAt,
      resultsPublished: true,
      totalCandidates: data.activeCandidates,
      totalVotes: data.totalVotes,
      leadingCandidate: data.leadingCandidate,
      tiedCandidates: data.tiedCandidates,
      isTie: data.isTie,
      results: data.results,
    };
  }

  // ---- Candidate CRUD ----
  async createCandidate(input: {
    name: string;
    classSection?: string;
    designation?: string;
    photoUrl?: string;
    symbol?: string;
    symbolLogoUrl?: string;
  }): Promise<{ ok: true; candidate: Candidate } | { ok: false; error: string }> {
    await this.init();
    const name = (input.name || '').trim();
    const photoUrl = (input.photoUrl || '').trim();
    const classSection = (input.classSection || '').trim();
    const designation = (input.designation || '').trim();
    const symbol = (input.symbol || '').trim();
    const symbolLogoUrl = (input.symbolLogoUrl || '').trim();

    if (!name) {
      return { ok: false, error: 'Candidate Name is required.' };
    }
    if (!photoUrl || photoUrl.startsWith('blob:')) {
      return { ok: false, error: 'Candidate Photo must be uploaded before registration.' };
    }
    if (!classSection) {
      return { ok: false, error: 'Class and Section is required.' };
    }
    if (!designation) {
      return { ok: false, error: 'Designation / Position Contesting For is required.' };
    }
    if (!symbol) {
      return { ok: false, error: 'Candidate Symbol Name is required.' };
    }
    if (!symbolLogoUrl || symbolLogoUrl.startsWith('blob:')) {
      return { ok: false, error: 'Candidate Symbol Logo must be uploaded before registration.' };
    }

    const id = `cnd_${crypto.randomBytes(6).toString('hex')}`;

    if (this.pool) {
      const res = await this.pool.query<LocalCandidateRow>(
        `INSERT INTO candidates (id, name, class_section, designation, photo_url, symbol, symbol_logo_url, created_at, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), TRUE)
         RETURNING id, name, class_section, designation, photo_url, symbol, symbol_logo_url, created_at, is_active`,
        [id, name, classSection, designation, photoUrl, symbol, symbolLogoUrl]
      );
      return { ok: true, candidate: mapCandidate(res.rows[0]) };
    }

    const db = this.localDb!;
    const row: LocalCandidateRow = {
      id,
      name,
      class_section: classSection,
      designation,
      photo_url: photoUrl,
      symbol,
      symbol_logo_url: symbolLogoUrl,
      created_at: new Date().toISOString(),
      is_active: true,
    };
    db.candidates.push(row);
    this.persistLocal(db);
    return { ok: true, candidate: mapCandidate(row) };
  }

  async updateCandidate(
    id: string,
    input: {
      name?: string;
      classSection?: string;
      designation?: string;
      photoUrl?: string;
      symbol?: string;
      symbolLogoUrl?: string;
    }
  ): Promise<{ ok: true; candidate: Candidate } | { ok: false; error: string }> {
    await this.init();

    if (input.photoUrl?.trim().startsWith('blob:') || input.symbolLogoUrl?.trim().startsWith('blob:')) {
      return { ok: false, error: 'Uploaded images must use persistent storage URLs.' };
    }

    if (this.pool) {
      const existingRes = await this.pool.query<LocalCandidateRow>(
        'SELECT * FROM candidates WHERE id = $1 AND is_active = TRUE',
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return { ok: false, error: 'Candidate not found.' };

      const nextName = input.name !== undefined ? input.name.trim() || existing.name : existing.name;
      const nextClass =
        input.classSection !== undefined ? input.classSection.trim() || existing.class_section : existing.class_section;
      const nextDesignation =
        input.designation !== undefined
          ? input.designation.trim() || existing.designation || ''
          : existing.designation || '';
      const nextPhoto = input.photoUrl !== undefined ? input.photoUrl.trim() || existing.photo_url : existing.photo_url;
      const nextSymbol = input.symbol !== undefined ? input.symbol.trim() || existing.symbol : existing.symbol;
      const nextSymbolLogo =
        input.symbolLogoUrl !== undefined
          ? input.symbolLogoUrl.trim() || existing.symbol_logo_url || ''
          : existing.symbol_logo_url || '';

      const res = await this.pool.query<LocalCandidateRow>(
        `UPDATE candidates
         SET name = $2, class_section = $3, designation = $4, photo_url = $5, symbol = $6, symbol_logo_url = $7
         WHERE id = $1
         RETURNING id, name, class_section, designation, photo_url, symbol, symbol_logo_url, created_at, is_active`,
        [id, nextName, nextClass, nextDesignation, nextPhoto, nextSymbol, nextSymbolLogo]
      );
      return { ok: true, candidate: mapCandidate(res.rows[0]) };
    }

    const db = this.localDb!;
    const existing = db.candidates.find((c) => c.id === id && c.is_active);
    if (!existing) return { ok: false, error: 'Candidate not found.' };

    if (input.name !== undefined && input.name.trim()) existing.name = input.name.trim();
    if (input.classSection !== undefined && input.classSection.trim()) {
      existing.class_section = input.classSection.trim();
    }
    if (input.designation !== undefined && input.designation.trim()) {
      existing.designation = input.designation.trim();
    }
    if (input.photoUrl !== undefined && input.photoUrl.trim()) {
      existing.photo_url = input.photoUrl.trim();
    }
    if (input.symbol !== undefined && input.symbol.trim()) existing.symbol = input.symbol.trim();
    if (input.symbolLogoUrl !== undefined && input.symbolLogoUrl.trim()) {
      existing.symbol_logo_url = input.symbolLogoUrl.trim();
    }
    this.persistLocal(db);
    return { ok: true, candidate: mapCandidate(existing) };
  }

  async removeCandidate(
    id: string,
    confirmed = false
  ): Promise<{ ok: true; deletedVotes: number } | { ok: false; error: string; status: number }> {
    await this.init();

    if (!confirmed) {
      return {
        ok: false,
        error: 'Confirmation is required to permanently remove this candidate and all their voting records.',
        status: 400,
      };
    }

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        const existingRes = await client.query<{ id: string }>(
          'SELECT id FROM candidates WHERE id = $1 FOR UPDATE',
          [id]
        );
        if (existingRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return { ok: false, error: 'Candidate not found or already removed.', status: 404 };
        }

        const deletedVotesRes = await client.query<{ id: string }>(
          'DELETE FROM votes WHERE candidate_id = $1 RETURNING id',
          [id]
        );
        await client.query('DELETE FROM candidates WHERE id = $1', [id]);

        await client.query('COMMIT');
        return { ok: true, deletedVotes: deletedVotesRes.rows.length };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('removeCandidate transaction error:', err);
        return { ok: false, error: 'Failed to remove candidate and voting records.', status: 500 };
      } finally {
        client.release();
      }
    }

    const db = this.localDb!;
    const exists = db.candidates.some((c) => c.id === id);
    if (!exists) {
      return { ok: false, error: 'Candidate not found or already removed.', status: 404 };
    }

    const deletedVotes = db.votes.filter((v) => v.candidate_id === id).length;
    db.candidates = db.candidates.filter((c) => c.id !== id);
    db.votes = db.votes.filter((v) => v.candidate_id !== id);
    this.persistLocal(db);
    return { ok: true, deletedVotes };
  }

  // ---- Election Controls ----
  async updateElectionStatus(
    nextStatus: ElectionStatus,
    publishResults?: boolean
  ): Promise<{ ok: true; electionStatus: ElectionStatus; resultsPublished: boolean; updatedAt: string }> {
    await this.init();
    const updatedAt = new Date().toISOString();

    if (this.pool) {
      if (typeof publishResults === 'boolean') {
        const res = await this.pool.query<LocalSettingsRow>(
          'UPDATE election_settings SET election_status = $1, results_published = $2, updated_at = NOW() WHERE id = 1 RETURNING results_published',
          [nextStatus, publishResults]
        );
        return {
          ok: true,
          electionStatus: nextStatus,
          resultsPublished: Boolean(res.rows[0]?.results_published),
          updatedAt,
        };
      }
      const res = await this.pool.query<LocalSettingsRow>(
        'UPDATE election_settings SET election_status = $1, updated_at = NOW() WHERE id = 1 RETURNING results_published',
        [nextStatus]
      );
      return {
        ok: true,
        electionStatus: nextStatus,
        resultsPublished: Boolean(res.rows[0]?.results_published),
        updatedAt,
      };
    }

    const db = this.localDb!;
    db.election_settings.election_status = nextStatus;
    if (typeof publishResults === 'boolean') {
      db.election_settings.results_published = publishResults;
    }
    db.election_settings.updated_at = updatedAt;
    this.persistLocal(db);
    return {
      ok: true,
      electionStatus: nextStatus,
      resultsPublished: Boolean(db.election_settings.results_published),
      updatedAt,
    };
  }

  async updateElectionSettings(input: {
    electionTitle?: string;
    electionDate?: string;
    resultsPublished?: boolean;
  }): Promise<{
    ok: true;
    electionTitle: string;
    electionDate: string;
    resultsPublished: boolean;
    updatedAt: string;
  }> {
    await this.init();
    const updatedAt = new Date().toISOString();

    if (this.pool) {
      const currentRes = await this.pool.query<LocalSettingsRow>(
        'SELECT election_title, election_date, results_published FROM election_settings WHERE id = 1'
      );
      const current = currentRes.rows[0];
      const nextTitle =
        input.electionTitle !== undefined
          ? input.electionTitle.trim() || 'Student Council Election'
          : current?.election_title || 'Student Council Election';
      const nextDate =
        input.electionDate !== undefined
          ? input.electionDate.trim() || updatedAt.slice(0, 10)
          : current?.election_date || updatedAt.slice(0, 10);
      const nextPublished =
        typeof input.resultsPublished === 'boolean'
          ? input.resultsPublished
          : Boolean(current?.results_published);

      await this.pool.query(
        'UPDATE election_settings SET election_title = $1, election_date = $2, results_published = $3, updated_at = NOW() WHERE id = 1',
        [nextTitle, nextDate, nextPublished]
      );
      return {
        ok: true,
        electionTitle: nextTitle,
        electionDate: nextDate,
        resultsPublished: nextPublished,
        updatedAt,
      };
    }

    const db = this.localDb!;
    if (input.electionTitle !== undefined) {
      db.election_settings.election_title = input.electionTitle.trim() || 'Student Council Election';
    }
    if (input.electionDate !== undefined) {
      db.election_settings.election_date = input.electionDate.trim() || updatedAt.slice(0, 10);
    }
    if (typeof input.resultsPublished === 'boolean') {
      db.election_settings.results_published = input.resultsPublished;
    }
    db.election_settings.updated_at = updatedAt;
    this.persistLocal(db);

    return {
      ok: true,
      electionTitle: db.election_settings.election_title || 'Student Council Election',
      electionDate: db.election_settings.election_date || updatedAt.slice(0, 10),
      resultsPublished: Boolean(db.election_settings.results_published),
      updatedAt,
    };
  }
}

export const pssemrDb = new PssemrDatabase();
