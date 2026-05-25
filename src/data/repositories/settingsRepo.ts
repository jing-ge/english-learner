import { getDb } from '../db';
import { DEFAULT_SETTINGS, type SettingsRecord } from '../types';

export const settingsRepo = {
  async get(): Promise<SettingsRecord> {
    const db = getDb();
    const existing = await db.settings.get(1);
    if (existing) return existing;
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  },

  async update(patch: Partial<Omit<SettingsRecord, 'id'>>): Promise<SettingsRecord> {
    const db = getDb();
    const cur = await this.get();
    const next: SettingsRecord = { ...cur, ...patch, id: 1 };
    await db.settings.put(next);
    return next;
  },
};
