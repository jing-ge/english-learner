import { getDb } from '../db';
import type { WordRecord } from '../types';

export const wordRepo = {
  async getById(id: string): Promise<WordRecord | undefined> {
    return getDb().words.get(id);
  },

  async getByWord(word: string): Promise<WordRecord | undefined> {
    return getDb().words.where('word').equals(word).first();
  },

  async listByWordbook(wordbookId: string, limit?: number): Promise<WordRecord[]> {
    const q = getDb().words.where('wordbooks').equals(wordbookId);
    return limit !== undefined ? q.limit(limit).toArray() : q.toArray();
  },

  async bulkUpsert(words: WordRecord[]): Promise<void> {
    await getDb().words.bulkPut(words);
  },

  /**
   * 批量取词条 id → freqRank 映射，供 scheduler 排序新词。
   * 仅返回有 freqRank 的词；wordIds 缺省时返回全部。
   */
  async getFreqRankMap(wordIds?: string[]): Promise<Map<string, number>> {
    const db = getDb();
    const out = new Map<string, number>();
    if (wordIds && wordIds.length > 0) {
      const rows = await db.words.bulkGet(wordIds);
      for (const w of rows) {
        if (w && typeof w.freqRank === 'number') out.set(w.id, w.freqRank);
      }
      return out;
    }
    await db.words.each((w) => {
      if (typeof w.freqRank === 'number') out.set(w.id, w.freqRank);
    });
    return out;
  },

  /** 仅用空字段填充，不覆盖已有内容（懒加载词义/音频时使用） */
  async patchEmptyFields(id: string, patch: Partial<WordRecord>): Promise<void> {
    const db = getDb();
    await db.transaction('rw', db.words, async () => {
      const existing = await db.words.get(id);
      if (!existing) return;
      const merged: WordRecord = { ...existing };
      let changed = false;
      for (const [k, v] of Object.entries(patch) as [keyof WordRecord, unknown][]) {
        if (v === undefined) continue;
        const cur = (existing as unknown as Record<string, unknown>)[k as string];
        const isEmpty =
          cur === undefined ||
          cur === null ||
          (Array.isArray(cur) && cur.length === 0) ||
          cur === '';
        if (isEmpty) {
          (merged as unknown as Record<string, unknown>)[k as string] = v;
          changed = true;
        }
      }
      if (changed) await db.words.put(merged);
    });
  },
};
