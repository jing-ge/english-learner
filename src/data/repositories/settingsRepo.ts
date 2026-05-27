import { getDb } from '../db';
import { DEFAULT_SETTINGS, type SettingsRecord } from '../types';

let cache: SettingsRecord | null = null;

export const settingsRepo = {
  async get(): Promise<SettingsRecord> {
    if (cache) return cache;
    const db = getDb();
    const existing = await db.settings.get(1);
    if (existing) { cache = existing; return existing; }
    await db.settings.put(DEFAULT_SETTINGS);
    cache = DEFAULT_SETTINGS;
    return DEFAULT_SETTINGS;
  },

  async update(patch: Partial<Omit<SettingsRecord, 'id'>>): Promise<SettingsRecord> {
    const db = getDb();
    const cur = await this.get();
    const next: SettingsRecord = { ...cur, ...patch, id: 1 };
    await db.settings.put(next);
    cache = next;
    return next;
  },

  /** 清除内存缓存（测试用） */
  _clearCache(): void { cache = null; },
};
