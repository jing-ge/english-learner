import type { Grade, SrsCard } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

/** 4 档反馈 → SM-2 论文里的 quality (0..5) */
const GRADE_TO_QUALITY: Record<Grade, number> = {
  0: 0, // 不认识
  1: 2, // 陌生
  2: 3, // 模糊
  3: 5, // 认识
};

export interface Sm2Result {
  ease: number;
  interval: number;
  repetitions: number;
  dueAt: number;
  state: SrsCard['state'];
}

export function defaultCardSrs(now: number): Sm2Result {
  return {
    ease: DEFAULT_EASE,
    interval: 0,
    repetitions: 0,
    dueAt: now,
    state: 'new',
  };
}

/**
 * SM-2 调度核心：根据当前卡片状态和用户反馈计算下一次状态。
 * 纯函数：不读不写数据库，不依赖 Date.now()（now 由调用方传入便于测试）。
 *
 * 与经典 SM-2 的差异：
 * - 失败（quality < 3，对应 grade 0/1）时把 interval 重置为 1 天、repetitions 归 0，
 *   状态降级到 'learning'，与 Anki 等现代实现一致。
 * - ease 永远不低于 MIN_EASE (1.3)。
 */
export function sm2(card: SrsCard, grade: Grade, now: number): Sm2Result {
  const quality = GRADE_TO_QUALITY[grade];

  // ease 调整公式（SuperMemo 原始公式）
  const nextEase = Math.max(
    MIN_EASE,
    card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  if (quality < 3) {
    // 失败：重新进入学习
    return {
      ease: nextEase,
      interval: 1,
      repetitions: 0,
      dueAt: now + 1 * MS_PER_DAY,
      state: 'learning',
    };
  }

  const nextRepetitions = card.repetitions + 1;
  let nextInterval: number;
  if (nextRepetitions === 1) {
    nextInterval = 1;
  } else if (nextRepetitions === 2) {
    nextInterval = 6;
  } else {
    nextInterval = Math.round(card.interval * nextEase);
  }

  return {
    ease: nextEase,
    interval: nextInterval,
    repetitions: nextRepetitions,
    dueAt: now + nextInterval * MS_PER_DAY,
    state: 'review',
  };
}

export const __testing__ = { MS_PER_DAY, MIN_EASE, DEFAULT_EASE, GRADE_TO_QUALITY };
