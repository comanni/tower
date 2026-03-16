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

// ── Project Members ──

export interface ProjectMember {
  userId: number;
  username: string;
  role: string;
  addedAt: string;
}

export function getProjectMembers(projectId: string): ProjectMember[] {
  const db = getDb();
  return db.prepare(`
    SELECT pm.user_id as userId, u.username, pm.role, pm.added_at as addedAt
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ? AND u.disabled = 0
    ORDER BY pm.role DESC, u.username
  `).all(projectId) as ProjectMember[];
}

export function addProjectMember(projectId: string, userId: number, role = 'member'): void {
  const db = getDb();
  db.prepare(
    'INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(projectId, userId, role);
}

export function removeProjectMember(projectId: string, userId: number): boolean {
  const db = getDb();
  // Prevent removing last owner
  const ownerCount = (db.prepare(
    `SELECT COUNT(*) as cnt FROM project_members WHERE project_id = ? AND role = 'owner'`
  ).get(projectId) as any).cnt;
  const isOwner = db.prepare(
    `SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? AND role = 'owner'`
  ).get(projectId, userId);
  if (isOwner && ownerCount <= 1) return false; // Can't remove last owner

  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, userId);
  return true;
}

export function isProjectOwner(projectId: string, userId: number): boolean {
  const db = getDb();
  return !!db.prepare(
    `SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? AND role = 'owner'`
  ).get(projectId, userId);
}

export function isProjectMember(projectId: string, userId: number): boolean {
  const db = getDb();
  return !!db.prepare(
    'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);
}

export function inviteGroupToProject(groupId: number, projectId: string): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT OR IGNORE INTO project_members (project_id, user_id, role)
    SELECT ?, ug.user_id, 'member'
    FROM user_groups ug
    JOIN users u ON u.id = ug.user_id
    WHERE ug.group_id = ? AND u.disabled = 0
  `).run(projectId, groupId);
  return result.changes;
}

// ── Core: 사용자가 접근 가능한 프로젝트 ID 목록 ──

export function getAccessibleProjectIds(userId: number, role: string): string[] | null {
  // admin → 전부 접근 가능
  if (role === 'admin') return null;

  const db = getDb();

  // project_members에 있는 프로젝트 + 본인이 만든 프로젝트
  const rows = db.prepare(`
    SELECT DISTINCT p.id FROM projects p
    WHERE p.archived = 0
      AND (
        EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = p.id AND pm.user_id = ?
        )
        OR p.user_id = ?
      )
  `).all(userId, userId) as { id: string }[];

  return rows.map(r => r.id);
}
