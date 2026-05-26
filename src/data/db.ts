import Dexie, { type Table } from 'dexie';
import type {
  WordRecord,
  WordbookRecord,
  CardRecord,
  ReviewLogRecord,
  SettingsRecord,
  AudioCacheRecord,
} from './types';
import { migrateSm2ToFsrs } from '../domain/srs/fsrs';

/**
 * IndexedDB schema，对齐 spec §5.1（v2 起词表全局化）。
 *
 * 索引选择：
 * - words: word（按词形查找）、*wordbooks（多值索引，按词书过滤）、freqRank（新词排序）
 * - cards: id 主键 = wordId（word lowercase）、dueAt + state + 复合 [state+dueAt]、*wordbooks 多值索引
 * - reviewLogs: reviewedAt（统计窗口）、cardId（回溯单卡历史）
 * - audioCache: cachedAt（淘汰策略）
 *
 * 版本策略：
 *   v1 初始：cards 用 wordbookId 单值字段（每词每书一卡）
 *   v2 重构：cards.wordbookId → wordbooks: string[]（同词多书共享一卡）
 *   v3 FSRS：SM-2 字段 → FSRS 字段，平滑迁移不丢进度。
 */
export class EnglishLearnerDB extends Dexie {
  words!: Table<WordRecord, string>;
  wordbooks!: Table<WordbookRecord, string>;
  cards!: Table<CardRecord, string>;
  reviewLogs!: Table<ReviewLogRecord, number>;
  settings!: Table<SettingsRecord, number>;
  audioCache!: Table<AudioCacheRecord, string>;

  constructor() {
    super('english-learner');
    this.version(1).stores({
      words: 'id, word, *wordbooks, freqRank',
      wordbooks: 'id, source',
      cards: 'id, wordId, wordbookId, dueAt, state, [state+dueAt], [wordbookId+state]',
      reviewLogs: '++id, cardId, reviewedAt',
      settings: 'id',
      audioCache: 'url, cachedAt',
    });
    // v2: 全局词表重构。cards 的 wordbookId 字段去掉，新增 *wordbooks 多值索引。
    // upgrade 直接清空：老用户极少（项目早期），种子会在 main.ts 的 ensureBuiltinSeeds 重新加载。
    this.version(2)
      .stores({
        words: 'id, word, *wordbooks, freqRank',
        wordbooks: 'id, source',
        cards: 'id, wordId, *wordbooks, dueAt, state, [state+dueAt]',
        reviewLogs: '++id, cardId, reviewedAt',
        settings: 'id',
        audioCache: 'url, cachedAt',
      })
      .upgrade(async (tx) => {
        // 不保留 v1 数据（老用户重新启用词书即可）。仅保留用户的 settings。
        await tx.table('cards').clear();
        await tx.table('reviewLogs').clear();
        await tx.table('words').clear();
        await tx.table('wordbooks').clear();
      });
    // v3: SM-2 → FSRS。字段替换，不丢数据；平滑迁移。
    this.version(3)
      .stores({
        words: 'id, word, *wordbooks, freqRank',
        wordbooks: 'id, source',
        cards: 'id, wordId, *wordbooks, dueAt, state, [state+dueAt]',
        reviewLogs: '++id, cardId, reviewedAt',
        settings: 'id',
        audioCache: 'url, cachedAt',
      })
      .upgrade(async (tx) => {
        const cardTable = tx.table('cards');
        const cards = await cardTable.toArray();
        if (cards.length === 0) return;
        const migrated = cards.map((c: any) => {
          const m = migrateSm2ToFsrs({
            ease: c.ease ?? 2.5,
            interval: c.interval ?? 0,
            repetitions: c.repetitions ?? 0,
            dueAt: c.dueAt,
            state: c.state ?? 'new',
            lastReviewedAt: c.lastReviewedAt,
          });
          return {
            id: c.id,
            wordId: c.wordId,
            wordbooks: c.wordbooks,
            stability: m.stability,
            difficulty: m.difficulty,
            elapsed_days: m.elapsed_days,
            scheduled_days: m.scheduled_days,
            reps: m.reps,
            lapses: m.lapses,
            dueAt: m.dueAt,
            state: m.state,
            addedAt: c.addedAt,
            lastReviewedAt: c.lastReviewedAt,
          };
        });
        await cardTable.clear();
        await cardTable.bulkPut(migrated);
        // 补齐 settings 新字段
        const settingsTable = tx.table('settings');
        const s: any = await settingsTable.get(1);
        if (s && s.desiredRetention === undefined) {
          await settingsTable.update(1, { desiredRetention: 0.9 });
        }
      });
  }
}

let _db: EnglishLearnerDB | null = null;

/** 单例访问。测试场景可调用 resetDb() 重新初始化（搭配 fake-indexeddb）。 */
export function getDb(): EnglishLearnerDB {
  if (!_db) _db = new EnglishLearnerDB();
  return _db;
}

export async function resetDb(): Promise<void> {
  if (_db) {
    await _db.delete();
    _db = null;
  }
}
