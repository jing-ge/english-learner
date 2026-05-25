// 与 spec §5.1 对齐的领域实体类型。
// 这里定义的是"持久化形态"，而非 UI 视图模型；UI 用到的派生字段由 store 计算。

import type { CardState } from '../domain/types';

export interface Translation {
  pos?: string; // 词性: n. v. adj. ...
  meaning: string;
}

export interface Example {
  en: string;
  zh?: string;
}

export interface Collocation {
  phrase: string;
  zh?: string;
}

export interface WordRecord {
  id: string; // 主键，如 "cet4_abandon"
  word: string;
  phonetic?: string;
  translations: Translation[];
  examples?: Example[];
  collocations?: Collocation[];
  audioUrl?: string;
  /** ECDICT exchange 字段：形态学变化（"p:ran/d:run/i:running/3:runs"），由 platform/morpho.ts 解析 */
  exchange?: string;
  wordbooks: string[]; // 多对多
  freqRank?: number;
}

export interface WordbookRecord {
  id: string;
  name: string;
  source: 'builtin' | 'user';
  totalCount: number;
  description?: string;
}

export interface CardRecord {
  id: string; // = wordId
  wordId: string;
  wordbookId: string;
  // SM-2 状态
  ease: number;
  interval: number;
  repetitions: number;
  dueAt: number;
  // 元数据
  state: CardState;
  addedAt: number;
  lastReviewedAt?: number;
}

export interface ReviewLogRecord {
  id?: number; // 自增主键
  cardId: string;
  reviewedAt: number;
  grade: 0 | 1 | 2 | 3;
  prevInterval: number;
  nextInterval: number;
  durationMs: number;
}

export interface SettingsRecord {
  id: 1; // 单例
  dailyNewCount: number;
  dailyReviewCap: number;
  activeWordbookIds: string[];
  ttsAccent: 'us' | 'uk';
  reminderTime?: string;
  theme: 'light' | 'dark' | 'auto';
}

export interface AudioCacheRecord {
  url: string; // 主键
  blob: Blob;
  cachedAt: number;
}

export const DEFAULT_SETTINGS: SettingsRecord = {
  id: 1,
  dailyNewCount: 20,
  dailyReviewCap: 200,
  activeWordbookIds: [],
  ttsAccent: 'us',
  theme: 'auto',
};
