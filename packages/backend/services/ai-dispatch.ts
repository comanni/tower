/**
 * AI Dispatch — @ai mention detection, rate limiting, and task creation.
 * Handles chat room @ai mentions → Tower task pipeline.
 */

// ── Types ─────────────────────────────────────────────────────────

export type MentionType = 'ai' | 'task';

export interface AiMention {
  found: boolean;
  prompt: string;        // text after @ai/@task, trimmed
  mentionType: MentionType;
  replyToTaskId?: string;
}

export interface RateLimitConfig {
  userPerMinute: number;   // per user across all rooms
  roomPerMinute: number;   // per room across all users
  globalPerMinute: number; // server-wide
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: 'user_limit' | 'room_limit' | 'global_limit';
  retryAfterMs?: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  userPerMinute: 5,
  roomPerMinute: 10,
  globalPerMinute: 30,
};

export const ROOM_CONCURRENT_LIMIT = 3;

// ── @ai Mention Parsing ──────────────────────────────────────────

/**
 * Parse a chat message for @ai or @task mentions.
 * Returns the prompt text after the mention, or found=false if no mention.
 *
 * @task is checked first (more specific action).
 * @ai triggers a quick reply (no task creation).
 *
 * Supported patterns:
 *   "@ai 이거 어떻게 생각해?"      → mentionType: 'ai', quick reply
 *   "@task 로그 수집해줘"           → mentionType: 'task', full task
 *   "@AI do something"             → mentionType: 'ai'
 *   "hey @task build this"         → mentionType: 'task'
 *   "email@ai.com"                 → found: false (part of email)
 */
export function parseAiMention(content: string): AiMention {
  // Check @task first (more specific)
  const taskMatch = content.match(/(^|[\s])@task\b/i);
  if (taskMatch) {
    const mentionEnd = (taskMatch.index ?? 0) + taskMatch[0].length;
    const prompt = content.slice(mentionEnd).trim();
    return { found: true, prompt, mentionType: 'task' };
  }

  // Then check @ai
  const aiMatch = content.match(/(^|[\s])@ai\b/i);
  if (aiMatch) {
    const mentionEnd = (aiMatch.index ?? 0) + aiMatch[0].length;
    const prompt = content.slice(mentionEnd).trim();
    return { found: true, prompt, mentionType: 'ai' };
  }

  return { found: false, prompt: '', mentionType: 'ai' };
}

// ── Rate Limiting (Sliding Window Counter) ────────────────────────

type WindowKey = string; // "user:{id}" | "room:{id}" | "global"

// Internal state — timestamps of recent @ai calls
const callWindows = new Map<WindowKey, number[]>();

/** Visible for testing — reset all rate limit state. */
export function resetRateLimits(): void {
  callWindows.clear();
}

/** Record a call timestamp for a given key. */
function recordCall(key: WindowKey, now: number): void {
  let timestamps = callWindows.get(key);
  if (!timestamps) {
    timestamps = [];
    callWindows.set(key, timestamps);
  }
  timestamps.push(now);
}

/** Count calls within the last windowMs for a given key. */
function countInWindow(key: WindowKey, now: number, windowMs: number): number {
  const timestamps = callWindows.get(key);
  if (!timestamps) return 0;

  // Prune old entries
  const cutoff = now - windowMs;
  const fresh = timestamps.filter(t => t > cutoff);
  callWindows.set(key, fresh);

  return fresh.length;
}

/** Get ms until the oldest entry in the window expires. */
function getRetryAfter(key: WindowKey, now: number, windowMs: number): number {
  const timestamps = callWindows.get(key);
  if (!timestamps || timestamps.length === 0) return 0;
  const oldest = timestamps[0];
  return Math.max(0, (oldest + windowMs) - now);
}

const WINDOW_MS = 60_000; // 1 minute

/**
 * Check if an @ai call is allowed under rate limits.
 * Does NOT record the call — call recordAiCall() after task creation succeeds.
 */
export function checkRateLimit(
  userId: number,
  roomId: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMITS,
  now: number = Date.now(),
): RateLimitResult {
  const userKey: WindowKey = `user:${userId}`;
  const roomKey: WindowKey = `room:${roomId}`;
  const globalKey: WindowKey = 'global';

  // Check user limit
  if (countInWindow(userKey, now, WINDOW_MS) >= config.userPerMinute) {
    return {
      allowed: false,
      reason: 'user_limit',
      retryAfterMs: getRetryAfter(userKey, now, WINDOW_MS),
    };
  }

  // Check room limit
  if (countInWindow(roomKey, now, WINDOW_MS) >= config.roomPerMinute) {
    return {
      allowed: false,
      reason: 'room_limit',
      retryAfterMs: getRetryAfter(roomKey, now, WINDOW_MS),
    };
  }

  // Check global limit
  if (countInWindow(globalKey, now, WINDOW_MS) >= config.globalPerMinute) {
    return {
      allowed: false,
      reason: 'global_limit',
      retryAfterMs: getRetryAfter(globalKey, now, WINDOW_MS),
    };
  }

  return { allowed: true };
}

/** Record a successful @ai call for rate limiting. */
export function recordAiCall(
  userId: number,
  roomId: string,
  now: number = Date.now(),
): void {
  recordCall(`user:${userId}`, now);
  recordCall(`room:${roomId}`, now);
  recordCall('global', now);
}

// ── Concurrent Task Limiting ──────────────────────────────────────

const runningRoomTasks = new Map<string, Set<string>>(); // roomId → taskIds

/** Visible for testing — reset concurrent task state. */
export function resetConcurrentTasks(): void {
  runningRoomTasks.clear();
}

export interface ConcurrentCheckResult {
  allowed: boolean;
  runningCount: number;
  limit: number;
}

/** Check if a room can accept another @ai task. */
export function checkConcurrentLimit(
  roomId: string,
  limit: number = ROOM_CONCURRENT_LIMIT,
): ConcurrentCheckResult {
  const running = runningRoomTasks.get(roomId);
  const count = running?.size ?? 0;
  return {
    allowed: count < limit,
    runningCount: count,
    limit,
  };
}

/** Register a task as running in a room. */
export function registerRoomTask(roomId: string, taskId: string): void {
  let set = runningRoomTasks.get(roomId);
  if (!set) {
    set = new Set();
    runningRoomTasks.set(roomId, set);
  }
  set.add(taskId);
}

/** Unregister a task when it completes/fails. */
export function unregisterRoomTask(roomId: string, taskId: string): void {
  const set = runningRoomTasks.get(roomId);
  if (set) {
    set.delete(taskId);
    if (set.size === 0) runningRoomTasks.delete(roomId);
  }
}

// ── Permission Check ──────────────────────────────────────────────

export type TowerRole = 'admin' | 'operator' | 'member' | 'viewer';
export type RoomRole = 'owner' | 'admin' | 'member' | 'readonly';

export interface AiCallPermission {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a user can invoke @ai in a room.
 * Requires Tower role >= member AND Room role >= member.
 */
export function checkAiCallPermission(
  towerRole: TowerRole,
  roomRole: RoomRole,
): AiCallPermission {
  const towerDenied = towerRole === 'viewer';
  const roomDenied = roomRole === 'readonly';

  if (towerDenied) {
    return { allowed: false, reason: 'Tower viewer 역할은 @ai를 호출할 수 없습니다.' };
  }
  if (roomDenied) {
    return { allowed: false, reason: '읽기 전용 멤버는 @ai를 호출할 수 없습니다.' };
  }

  return { allowed: true };
}

/**
 * Determine the execution permission mode for a room @ai task.
 * Room tasks are always capped at 'acceptEdits' — even for admins.
 * This prevents @ai from running destructive commands that affect shared data.
 */
export function getRoomTaskPermissionMode(
  towerRole: TowerRole,
): 'acceptEdits' | 'plan' {
  if (towerRole === 'viewer') return 'plan';
  // All other roles (admin, operator, member) → acceptEdits
  // Admin is NOT bypassPermissions in room context (safety: shared environment)
  return 'acceptEdits';
}
