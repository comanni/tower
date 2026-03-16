import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db/schema.js';
import { VALID_ROLES } from './damage-control.js';
import type { Request, Response, NextFunction } from 'express';

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
}

// ───── AES-256-GCM Encryption ─────

const ALGO = 'aes-256-gcm';

function deriveKey(): Buffer {
  // Derive a 32-byte key from JWT secret using SHA-256
  return crypto.createHash('sha256').update(config.jwtSecret).digest();
}

export function encryptPassword(plain: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPassword(stored: string): string | null {
  try {
    const [ivHex, tagHex, encHex] = stored.split(':');
    if (!ivHex || !tagHex || !encHex) return null;
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null; // Not AES-encrypted (legacy bcrypt hash)
  }
}

function isAesEncrypted(stored: string): boolean {
  // AES format has two colons: iv:tag:encrypted
  return stored.split(':').length === 3;
}

// ───── Legacy bcrypt (for migration) ─────

function verifyBcrypt(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

// ───── JWT ─────

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.tokenExpiry as any });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

// ───── User CRUD ─────

export function createUser(username: string, password: string, role = 'member') {
  const db = getDb();
  const encrypted = encryptPassword(password);
  const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, encrypted, role);
  return { id: result.lastInsertRowid as number, username, role };
}

export function authenticateUser(username: string, password: string): JwtPayload | null {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND disabled = 0').get(username) as any;
  if (!user) return null;

  const stored = user.password_hash;
  let ok = false;

  if (isAesEncrypted(stored)) {
    // New AES path
    const decrypted = decryptPassword(stored);
    ok = decrypted === password;
  } else {
    // Legacy bcrypt fallback
    ok = verifyBcrypt(password, stored);
    // Auto-migrate to AES on successful login
    if (ok) {
      const encrypted = encryptPassword(password);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(encrypted, user.id);
    }
  }

  if (!ok) return null;
  return { userId: user.id, username: user.username, role: user.role };
}

export function hasUsers(): boolean {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE disabled = 0').get() as any;
  return row.count > 0;
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  const queryToken = req.query?.token as string | undefined;
  if (queryToken) return queryToken;
  const cookies = req.headers.cookie || '';
  const match = cookies.match(/(?:^|;\s*)tower_token=([^;]+)/);
  if (match) return match[1];
  return null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!config.authEnabled) return next();

  const rawToken = extractToken(req);

  if (!rawToken) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const payload = verifyToken(rawToken);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  (req as any).user = payload;
  next();
}

// ───── Admin user management ─────

export function listUsers() {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, username, role, allowed_path, password_hash, created_at FROM users WHERE disabled = 0 ORDER BY id'
  ).all() as any[];

  return rows.map(r => ({
    id: r.id,
    username: r.username,
    role: r.role,
    allowed_path: r.allowed_path,
    // Decrypt password for admin view; show empty for legacy bcrypt
    password_plain: isAesEncrypted(r.password_hash) ? decryptPassword(r.password_hash) || '' : '',
    created_at: r.created_at,
  }));
}

export function updateUserRole(userId: number, role: string) {
  if (!VALID_ROLES.has(role)) {
    throw new Error(`Invalid role: ${role}. Valid roles: ${[...VALID_ROLES].join(', ')}`);
  }
  const db = getDb();
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
}

export function updateUserPath(userId: number, allowedPath: string) {
  const db = getDb();
  db.prepare('UPDATE users SET allowed_path = ? WHERE id = ?').run(allowedPath, userId);
}

export function resetUserPassword(userId: number, newPassword: string) {
  const db = getDb();
  const encrypted = encryptPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(encrypted, userId);
}

export function disableUser(userId: number) {
  const db = getDb();
  db.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run(userId);
}

export function getUserAllowedPath(userId: number): string {
  const db = getDb();
  const row = db.prepare('SELECT allowed_path FROM users WHERE id = ?').get(userId) as any;
  return row?.allowed_path || config.workspaceRoot;
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function verifyWsToken(token: string | null): JwtPayload | null {
  if (!config.authEnabled) return { userId: 0, username: 'anonymous', role: 'admin' };
  if (!token) return null;
  return verifyToken(token);
}
