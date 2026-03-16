import { describe, it, expect } from 'vitest';

/**
 * Phase 0C — Native addon load regression guard.
 * Ensures better-sqlite3 and pg can be imported after workspace migration.
 */

describe('native addon loading', () => {
  it('better-sqlite3 import 성공', async () => {
    const mod = await import('better-sqlite3');
    expect(mod.default || mod).toBeDefined();
  });

  it('in-memory SQLite DB 열기', async () => {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(':memory:');
    expect(db).toBeDefined();
    db.close();
  });

  it('pg 모듈 import 성공', async () => {
    const mod = await import('pg');
    expect(mod.default || mod.Pool || mod.Client).toBeDefined();
  });
});
