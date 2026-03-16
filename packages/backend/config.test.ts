import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Phase 0B — PROJECT_ROOT path resolution regression guard.
 * These tests lock down the current path assumptions so we catch
 * breakage when config.ts moves to packages/backend/.
 */

// Import the live config to test actual resolved values
const config = await import('./config.js');

// Derive PROJECT_ROOT the same way config.ts does (now in packages/backend/)
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = __dirname.includes('dist')
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '..', '..');

describe('config — PROJECT_ROOT path resolution', () => {
  it('PROJECT_ROOT에 package.json이 존재한다', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'package.json'))).toBe(true);
  });

  it('config.dbPath가 data/tower.db로 끝난다', () => {
    expect(config.config.dbPath).toMatch(/data[/\\]tower\.db$/);
  });

  it('config.frontendDir가 dist/frontend로 끝난다', () => {
    expect(config.config.frontendDir).toMatch(/dist[/\\]frontend$/);
  });

  it('PROJECT_ROOT/data 디렉토리가 존재한다', () => {
    expect(fs.existsSync(path.join(PROJECT_ROOT, 'data'))).toBe(true);
  });
});
