import Dexie, { type Table } from 'dexie';
import type {
  WordRecord,
  WordbookRecord,
  CardRecord,
  ReviewLogRecord,
  SettingsRecord,
  AudioCacheRecord,
} from './types';

/**
 * IndexedDB schema，对齐 spec §5.1。
 *
 * 索引选择：
 * - words: word（按词形查找）、*wordbooks（多值索引，按词书过滤）、freqRank（新词排序）
 * - cards: dueAt + state + wordbookId + 复合 [state+dueAt]（取今天到期复习卡）
 * - reviewLogs: reviewedAt（统计窗口）、cardId（回溯单卡历史）
 * - audioCache: cachedAt（淘汰策略）
 *
 * 版本策略：v1 是初始 schema。任何字段/索引变更必须新建 version + upgrade 函数，
 * 保留旧版本声明，避免老用户数据丢失。
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
