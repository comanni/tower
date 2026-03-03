import { getDb } from '../db/schema.js';

export interface SearchResult {
  type: 'session' | 'message';
  sessionId: string;
  sessionName: string;
  snippet: string;
  rank: number;
  createdAt: string;
}

export function search(query: string, opts: { userId?: number; limit?: number } = {}): SearchResult[] {
  const db = getDb();
  const limit = opts.limit || 20;
  const escaped = trigramEscape(query);
  const results: SearchResult[] = [];

  // 1) Session search (name, summary)
  try {
    const params: any[] = [escaped];
    if (opts.userId) params.push(opts.userId);
    params.push(limit);

    const sessionHits = db.prepare(`
      SELECT s.id, s.name, s.summary, s.created_at, f.rank
      FROM sessions_fts f
      JOIN sessions s ON s.rowid = f.rowid
      WHERE sessions_fts MATCH ?
        ${opts.userId ? 'AND s.user_id = ?' : ''}
        AND (s.archived IS NULL OR s.archived = 0)
      ORDER BY f.rank
      LIMIT ?
    `).all(...params) as any[];

    for (const hit of sessionHits) {
      results.push({
        type: 'session',
        sessionId: hit.id,
        sessionName: hit.name,
        snippet: hit.summary || hit.name,
        rank: hit.rank,
        createdAt: hit.created_at,
      });
    }
  } catch (err) { console.error('[search] sessions_fts error:', err); }

  // 2) Message search (body)
  try {
    const params: any[] = [escaped];
    if (opts.userId) params.push(opts.userId);
    params.push(limit);

    const messageHits = db.prepare(`
      SELECT m.id, m.session_id, m.role, m.created_at, f.body, f.rank,
             s.name as session_name
      FROM messages_fts f
      JOIN messages m ON m.rowid = f.rowid
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
        ${opts.userId ? 'AND s.user_id = ?' : ''}
        AND (s.archived IS NULL OR s.archived = 0)
      ORDER BY f.rank
      LIMIT ?
    `).all(...params) as any[];

    for (const hit of messageHits) {
      const body = hit.body || '';
      const idx = body.toLowerCase().indexOf(query.toLowerCase());
      const start = Math.max(0, idx - 80);
      const end = Math.min(body.length, idx + query.length + 120);
      const snippet = (start > 0 ? '...' : '') + body.slice(start, end) + (end < body.length ? '...' : '');

      results.push({
        type: 'message',
        sessionId: hit.session_id,
        sessionName: hit.session_name,
        snippet,
        rank: hit.rank,
        createdAt: hit.created_at,
      });
    }
  } catch (err) { console.error('[search] messages_fts error:', err); }

  return results.sort((a, b) => a.rank - b.rank).slice(0, limit);
}

function trigramEscape(q: string): string {
  return `"${q.replace(/"/g, '""')}"`;
}
