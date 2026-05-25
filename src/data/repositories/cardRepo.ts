import { getDb } from '../db';
import type { CardRecord } from '../types';
import type { CardState } from '../../domain/types';

export const cardRepo = {
  async getById(id: string): Promise<CardRecord | undefined> {
    return getDb().cards.get(id);
  },

  async listAllActive(activeWordbookIds: string[]): Promise<CardRecord[]> {
    const db = getDb();
    if (activeWordbookIds.length === 0) {
      return db.cards.toArray();
    }
    return db.cards.where('wordbookId').anyOf(activeWordbookIds).toArray();
  },

  /** 用复合索引 [state+dueAt] 取到期卡，单次范围查询 */
  async listDueReviews(now: number, limit?: number): Promise<CardRecord[]> {
    const db = getDb();
    const q = db.cards
      .where('[state+dueAt]')
      .between(['review', -Infinity], ['review', now], true, true);
    return limit !== undefined ? q.limit(limit).toArray() : q.toArray();
  },

  async listByState(state: CardState): Promise<CardRecord[]> {
    return getDb().cards.where('state').equals(state).toArray();
  },

  async upsert(card: CardRecord): Promise<void> {
    await getDb().cards.put(card);
  },

  async bulkUpsert(cards: CardRecord[]): Promise<void> {
    await getDb().cards.bulkPut(cards);
  },

  async deleteByWordbookAndState(wordbookId: string, state: CardState): Promise<number> {
    return getDb()
      .cards.where({ wordbookId, state })
      .delete();
  },
};
