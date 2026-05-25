import { getDb } from '../db';
import type { WordbookRecord } from '../types';

export const wordbookRepo = {
  async getById(id: string): Promise<WordbookRecord | undefined> {
    return getDb().wordbooks.get(id);
  },

  async listAll(): Promise<WordbookRecord[]> {
    return getDb().wordbooks.toArray();
  },

  async listBuiltin(): Promise<WordbookRecord[]> {
    return getDb().wordbooks.where('source').equals('builtin').toArray();
  },

  async upsert(book: WordbookRecord): Promise<void> {
    await getDb().wordbooks.put(book);
  },
};
