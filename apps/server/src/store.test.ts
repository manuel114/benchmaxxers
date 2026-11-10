import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_APPEARANCE, appearanceFromSeed } from '@benchmaxxers/shared';
import { openStore, type Store } from './store.js';

let store: Store;
beforeEach(() => { store = openStore(':memory:'); });
afterEach(() => { store.close(); });

const makeAgent = (s: Store, name = 'Ava') => s.createAgent({
  ownerId: s.ensureOwner('tester', 0), name, model: 'unknown', passHash: `hash-${name}`, now: 0,
});

describe('saved cosmetics', () => {
  it('assigns a look once and keeps it through pass rotation and progress', () => {
    const a = makeAgent(store);
    expect(a.appearance).toEqual(appearanceFromSeed(a.id));
    store.replacePass(a.id, 'new-hash');
    store.addPoints(a.id, 'strength', 1000);
    expect(store.agentByPassHash('new-hash')!.appearance).toEqual(a.appearance);
    expect(store.agentByName('Ava')!.appearance).toEqual(a.appearance);
    expect(store.agentById(a.id)!.points.strength).toBe(1000);
  });

  it('merges custom choices, preserves unspecified parts and rejects invalid writes', () => {
    const a = makeAgent(store);
    store.addPoints(a.id, 'strength', 900);
    const next = store.updateAppearance(a.id, { hairstyle: 'bob', top: 'purple' })!;
    expect(next.appearance).toEqual({ ...a.appearance, hairstyle: 'bob', top: 'purple' });
    expect(next.points.strength).toBe(900);
    expect(store.updateAppearance(a.id, { shoes: 'teal' })!.appearance).toEqual({ ...next.appearance, shoes: 'teal' });
    expect(() => store.updateAppearance(a.id, { top: 'invalid' } as never)).toThrow();
    expect(store.agentById(a.id)!.appearance.top).toBe('purple');
  });

  it('persists edits after closing and reopening the database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'benchmaxxers-appearance-'));
    let disk: Store | undefined;
    try {
      const path = join(dir, 'gym.sqlite');
      disk = openStore(path);
      const a = makeAgent(disk);
      const edited = disk.updateAppearance(a.id, { hairstyle: 'bun', hair: 'auburn', top: 'green', topStyle: 'hoodie', bottomsStyle: 'joggers' })!;
      disk.close();
      disk = openStore(path);
      expect(disk.agentById(a.id)!.appearance).toEqual(edited.appearance);
    } finally { disk?.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('keeps pre-clothing saved colors and supplies T-shirt/shorts defaults across restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'benchmaxxers-old-clothes-'));
    let disk: Store | undefined;
    try {
      const path = join(dir, 'gym.sqlite');
      disk = openStore(path);
      const a = makeAgent(disk);
      disk.addPoints(a.id, 'strength', 700);
      disk.close(); disk = undefined;
      const { topStyle: _top, bottomsStyle: _bottoms, ...oldLook } = DEFAULT_APPEARANCE;
      const old = new DatabaseSync(path);
      old.prepare('UPDATE agents SET appearance_json = ? WHERE id = ?').run(JSON.stringify(oldLook), a.id);
      old.close();
      disk = openStore(path);
      expect(disk.agentById(a.id)!.appearance).toEqual(DEFAULT_APPEARANCE);
      const edited = disk.updateAppearance(a.id, { topStyle: 'tank', bottomsStyle: 'leggings' })!;
      expect(edited.appearance).toEqual({ ...DEFAULT_APPEARANCE, topStyle: 'tank', bottomsStyle: 'leggings' });
      expect(edited.points.strength).toBe(700);
      disk.close();
      disk = openStore(path);
      expect(disk.agentById(a.id)!.appearance).toEqual(edited.appearance);
    } finally { disk?.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('upgrades a pre-appearance database idempotently without losing agents or scores', () => {
    const dir = mkdtempSync(join(tmpdir(), 'benchmaxxers-legacy-'));
    let disk: Store | undefined;
    try {
      const path = join(dir, 'gym.sqlite');
      disk = openStore(path);
      const a = makeAgent(disk);
      disk.addPoints(a.id, 'strength', 500);
      disk.close(); disk = undefined;
      const old = new DatabaseSync(path);
      old.exec('ALTER TABLE agents DROP COLUMN appearance_json');
      old.close();
      disk = openStore(path);
      const migrated = disk.agentById(a.id)!;
      expect(migrated.appearance).toEqual(appearanceFromSeed(a.id));
      expect(migrated.points.strength).toBe(500);
      const upgraded = new DatabaseSync(path);
      const saved = upgraded.prepare('SELECT appearance_json FROM agents WHERE id = ?').get(a.id)!;
      expect(JSON.parse(saved.appearance_json as string)).toEqual(migrated.appearance);
      upgraded.close();
      disk.close();
      disk = openStore(path);
      expect(disk.agentByPassHash('hash-Ava')!.appearance).toEqual(migrated.appearance);
      expect(disk.updateAppearance(a.id, { hairstyle: 'curls' })!.appearance.hairstyle).toBe('curls');
    } finally { disk?.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
