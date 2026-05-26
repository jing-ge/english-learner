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
  /** ECDICT tag 字段：空格分隔的等级标签，如 "zk gk cet4 cet6 ky ielts toefl gre" */
  tag?: string;
  /** BNC 词频排名（越小越高频） */
  bnc?: number;
  /** COCA 词频排名（越小越高频） */
  frq?: number;
  wordbooks: string[]; // 多对多
  freqRank?: number;
}

export interface WordbookRecord {
  id: string;
  name: string;
  source: 'builtin' | 'user';
  totalCount: number;
  description?: string;
  /** 内置种子版本号，用于在 seed JSON 升级后触发重灌。仅 source='builtin' 时存在。 */
  seedVersion?: number;
}

export interface CardRecord {
  id: string; // = wordId（v2 起：word lowercase 本身，无词书前缀）
  wordId: string;
  /** v2：一卡多词书归属。同词被多本启用时只保留一张卡，wordbooks 合并 */
  wordbooks: string[];
  // FSRS 状态
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
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
  /** 错词判定窗口天数，默认 14 */
  wrongWindowDays: number;
  /** 错词阈值：grade <= wrongMaxGrade 视为错词。默认 1（不会+陌生） */
  wrongMaxGrade: 0 | 1 | 2;
  /** FSRS 目标留存率，默认 0.9 */
  desiredRetention: number;
  /** FSRS 个性化参数（17 元数组），空则用默认值 */
  fsrsWeights?: number[];
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
  wrongWindowDays: 14,
  wrongMaxGrade: 1,
  desiredRetention: 0.9,
};
