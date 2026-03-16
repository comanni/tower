import { getDb } from '../db/schema.js';
import { getAccessibleProjectIds } from './group-manager.js';

export interface SearchResult {
  type: 'session' | 'message';
  sessionId: string;
  sessionName: string;
  snippet: string;
  rank: number;
  createdAt: string;
}

export function search(query: string, opts: { userId?: number; role?: string; limit?: number } = {}): SearchResult[] {
  const db = getDb();
  const limit = opts.limit || 20;
  const escaped = trigramEscape(query);
  const results: SearchResult[] = [];

  // Determine accessible project IDs for group filtering
  const accessibleIds = (opts.userId && opts.role)
    ? getAccessibleProjectIds(opts.userId, opts.role)
    : null;

  // Filter function: same logic as sessions — project sessions by group, non-project by creator
  const isVisible = (row: { user_id: number | null; project_id: string | null }) => {
    if (accessibleIds === null) return true; // admin or no groups
    if (!row.project_id) return row.user_id === opts.userId;
    return accessibleIds.includes(row.project_id);
  };

  // Fetch extra rows to compensate for post-filtering
  const fetchLimit = limit * 3;

  // 1) Session search (name, summary)
  try {
    const sessionHits = db.prepare(`
      SELECT s.id, s.name, s.summary, s.created_at, s.user_id, s.project_id, f.rank
      FROM sessions_fts f
      JOIN sessions s ON s.rowid = f.rowid
      WHERE sessions_fts MATCH ?
        AND (s.archived IS NULL OR s.archived = 0)
      ORDER BY f.rank
      LIMIT ?
    `).all(escaped, fetchLimit) as any[];

    for (const hit of sessionHits) {
      if (!isVisible(hit)) continue;
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
    const messageHits = db.prepare(`
      SELECT m.id, m.session_id, m.role, m.created_at, f.body, f.rank,
             s.name as session_name, s.user_id, s.project_id
      FROM messages_fts f
      JOIN messages m ON m.rowid = f.rowid
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ?
        AND (s.archived IS NULL OR s.archived = 0)
      ORDER BY f.rank
      LIMIT ?
    `).all(escaped, fetchLimit) as any[];

    for (const hit of messageHits) {
      if (!isVisible(hit)) continue;
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
