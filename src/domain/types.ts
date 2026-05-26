// SRS / 学习会话相关共享类型
// 集中放在 domain/types.ts 是为了让 fsrs / scheduler / studySession 等模块共享，
// 同时避免领域层依赖 data 层的 Dexie 表类型。

export type CardState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';

/** 用户对一张卡的反馈档位 */
export type Grade = 0 | 1 | 2 | 3;

/** FSRS 算法所需的最小卡片状态切片（不耦合存储） */
export interface SrsCard {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  dueAt: number;
  state: CardState;
  lastReviewedAt?: number;
}
