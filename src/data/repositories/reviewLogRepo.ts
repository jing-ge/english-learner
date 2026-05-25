import { getDb } from '../db';
import type { ReviewLogRecord } from '../types';

export const reviewLogRepo = {
  async append(log: Omit<ReviewLogRecord, 'id'>): Promise<number> {
    return getDb().reviewLogs.add(log as ReviewLogRecord);
  },

  async listSince(timestamp: number): Promise<ReviewLogRecord[]> {
    return getDb().reviewLogs.where('reviewedAt').aboveOrEqual(timestamp).toArray();
  },

  async listByCard(cardId: string): Promise<ReviewLogRecord[]> {
    return getDb().reviewLogs.where('cardId').equals(cardId).toArray();
  },

  async countSince(timestamp: number): Promise<number> {
    return getDb().reviewLogs.where('reviewedAt').aboveOrEqual(timestamp).count();
  },
};
