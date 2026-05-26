import { getDb } from '../db';
import type { WordRecord } from '../types';

export const wordRepo = {
  async getById(id: string): Promise<WordRecord | undefined> {
    return getDb().words.get(id);
  },

  async getByWord(word: string): Promise<WordRecord | undefined> {
    return getDb().words.where('word').equals(word).first();
  },

  async bulkGet(ids: string[]): Promise<(WordRecord | undefined)[]> {
    if (ids.length === 0) return [];
    return getDb().words.bulkGet(ids);
  },

  async listByWordbook(wordbookId: string, limit?: number): Promise<WordRecord[]> {
    const q = getDb().words.where('wordbooks').equals(wordbookId);
    return limit !== undefined ? q.limit(limit).toArray() : q.toArray();
  },

  async bulkUpsert(words: WordRecord[]): Promise<void> {
    await getDb().words.bulkPut(words);
  },

  /**
   * 批量取词条 id → 频率排名映射，供 scheduler 排序新词。
   * freqRank（种子初始化时写入）优先，回退 bnc → frq（ECDICT 懒加载写入）。
   * 均缺失的词不加入 Map，排序时视为 Infinity（排最后）。
   */
  async getFreqRankMap(wordIds?: string[]): Promise<Map<string, number>> {
    const db = getDb();
    const out = new Map<string, number>();
    const pick = (w: WordRecord): number | undefined =>
      w.freqRank ?? w.bnc ?? w.frq;
    if (wordIds && wordIds.length > 0) {
      const rows = await db.words.bulkGet(wordIds);
      for (const w of rows) {
        if (w) {
          const r = pick(w);
          if (r !== undefined) out.set(w.id, r);
        }
      }
      return out;
    }
    await db.words.each((w) => {
      const r = pick(w);
      if (r !== undefined) out.set(w.id, r);
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
