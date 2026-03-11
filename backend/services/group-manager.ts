import { getDb } from '../db/schema.js';

export interface Group {
  id: number;
  name: string;
  description: string | null;
  isGlobal: boolean;
  createdAt: string;
}

export interface GroupWithMembers extends Group {
  members: { id: number; username: string }[];
  projects: { id: string; name: string }[];
}

function rowToGroup(row: any): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isGlobal: !!row.is_global,
    createdAt: row.created_at,
  };
}

// ── Group CRUD ──

export function createGroup(name: string, description?: string, isGlobal = false): Group {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO groups (name, description, is_global) VALUES (?, ?, ?)'
  ).run(name, description ?? null, isGlobal ? 1 : 0);
  return getGroup(result.lastInsertRowid as number)!;
}

export function getGroup(id: number): Group | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as any;
  return row ? rowToGroup(row) : null;
}

export function listGroups(): GroupWithMembers[] {
  const db = getDb();
  const groups = (db.prepare('SELECT * FROM groups ORDER BY name').all() as any[]).map(rowToGroup);

  return groups.map(g => ({
    ...g,
    members: db.prepare(
      `SELECT u.id, u.username FROM users u
       JOIN user_groups ug ON ug.user_id = u.id
       WHERE ug.group_id = ? AND u.disabled = 0
       ORDER BY u.username`
    ).all(g.id) as { id: number; username: string }[],
    projects: db.prepare(
      `SELECT p.id, p.name FROM projects p
       JOIN project_groups pg ON pg.project_id = p.id
       WHERE pg.group_id = ? AND p.archived = 0
       ORDER BY p.name`
    ).all(g.id) as { id: string; name: string }[],
  }));
}

export function updateGroup(id: number, updates: { name?: string; description?: string; isGlobal?: boolean }): Group | null {
  const db = getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description); }
  if (updates.isGlobal !== undefined) { sets.push('is_global = ?'); vals.push(updates.isGlobal ? 1 : 0); }
  if (sets.length === 0) return getGroup(id);
  vals.push(id);
  db.prepare(`UPDATE groups SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return getGroup(id);
}

export function deleteGroup(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  return result.changes > 0;
}

// ── User ↔ Group ──

export function addUserToGroup(userId: number, groupId: number): void {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO user_groups (user_id, group_id) VALUES (?, ?)').run(userId, groupId);
}

export function removeUserFromGroup(userId: number, groupId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM user_groups WHERE user_id = ? AND group_id = ?').run(userId, groupId);
}

export function getUserGroups(userId: number): Group[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT g.* FROM groups g
     JOIN user_groups ug ON ug.group_id = g.id
     WHERE ug.user_id = ?
     ORDER BY g.name`
  ).all(userId) as any[];
  return rows.map(rowToGroup);
}

// ── Project ↔ Group ──

export function addProjectToGroup(projectId: string, groupId: number): void {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO project_groups (project_id, group_id) VALUES (?, ?)').run(projectId, groupId);
}

export function removeProjectFromGroup(projectId: string, groupId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM project_groups WHERE project_id = ? AND group_id = ?').run(projectId, groupId);
}

export function getProjectGroups(projectId: string): Group[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT g.* FROM groups g
     JOIN project_groups pg ON pg.group_id = g.id
     WHERE pg.project_id = ?
     ORDER BY g.name`
  ).all(projectId) as any[];
  return rows.map(rowToGroup);
}

// ── Core: 사용자가 접근 가능한 프로젝트 ID 목록 ──

export function getAccessibleProjectIds(userId: number, role: string): string[] | null {
  // admin은 전부 접근 가능 → null = 필터링 안 함
  if (role === 'admin') return null;

  const db = getDb();

  // 그룹 테이블이 비어있으면 → 기존 동작 (필터링 안 함)
  const groupCount = (db.prepare('SELECT COUNT(*) as cnt FROM groups').get() as any).cnt;
  if (groupCount === 0) return null;

  // 사용자가 is_global 그룹에 속하면 → 전부 접근 가능
  const hasGlobal = db.prepare(
    `SELECT 1 FROM user_groups ug
     JOIN groups g ON g.id = ug.group_id
     WHERE ug.user_id = ? AND g.is_global = 1
     LIMIT 1`
  ).get(userId);
  if (hasGlobal) return null;

  // 접근 가능한 프로젝트:
  // 1. 사용자의 그룹에 속한 프로젝트
  // 2. 본인이 만든 프로젝트
  // (미배정 프로젝트는 비공개 — 생성자 + admin만 보임)
  const rows = db.prepare(`
    SELECT DISTINCT p.id FROM projects p
    WHERE p.archived = 0
      AND (
        EXISTS (
          SELECT 1 FROM project_groups pg
          JOIN user_groups ug ON ug.group_id = pg.group_id
          WHERE pg.project_id = p.id AND ug.user_id = ?
        )
        OR p.user_id = ?
      )
  `).all(userId, userId) as { id: string }[];

  return rows.map(r => r.id);
}
