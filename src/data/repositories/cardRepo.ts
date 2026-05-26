import { getDb } from '../db';
import type { CardRecord } from '../types';
import type { CardState } from '../../domain/types';

export const cardRepo = {
  async getById(id: string): Promise<CardRecord | undefined> {
    return getDb().cards.get(id);
  },

  /**
   * 按启用词书过滤所有卡。空数组视为"取全部"（保持与旧版兼容）。
   * 用 *wordbooks 多值索引 + .distinct() 避免一卡属多本时重复返回。
   */
  async listAllActive(activeWordbookIds: string[]): Promise<CardRecord[]> {
    const db = getDb();
    if (activeWordbookIds.length === 0) {
      return db.cards.toArray();
    }
    return db.cards.where('wordbooks').anyOf(activeWordbookIds).distinct().toArray();
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

  /**
   * 按 state + 启用词书过滤。先用 *wordbooks 多值索引拿候选，再 in-memory 过 state。
   * 调用方常见用例：拿 'new' / 'learning' 卡。
   */
  async listByStateAndWordbooks(
    state: CardState,
    activeWordbookIds: string[],
  ): Promise<CardRecord[]> {
    const db = getDb();
    if (activeWordbookIds.length === 0) {
      return db.cards.where('state').equals(state).toArray();
    }
    const cands = await db.cards
      .where('wordbooks')
      .anyOf(activeWordbookIds)
      .distinct()
      .toArray();
    return cands.filter((c) => c.state === state);
  },

  async upsert(card: CardRecord): Promise<void> {
    await getDb().cards.put(card);
  },

  async bulkUpsert(cards: CardRecord[]): Promise<void> {
    await getDb().cards.bulkPut(cards);
  },

  /**
   * 词书禁用时清理。仅删 (state + 该词书归属) 的卡。
   * v2 起 cards 用 wordbooks 多值索引，不再有 [wordbookId+state] 复合索引，
   * 走 *wordbooks 索引取候选 + 内存过 state，启用/禁用频率低可接受。
   * 注意：若卡的 wordbooks 还含其它启用词书，本函数仍会删卡——调用方应在
   * 业务层（wordbookService.disableWordbook）先做"是否独占该词书"的判断。
   */
  async deleteByWordbookAndState(wordbookId: string, state: CardState): Promise<number> {
    const db = getDb();
    const cands = await db.cards.where('wordbooks').equals(wordbookId).toArray();
    const ids = cands.filter((c) => c.state === state).map((c) => c.id);
    if (ids.length === 0) return 0;
    await db.cards.bulkDelete(ids);
    return ids.length;
  },
};
