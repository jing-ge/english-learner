import { fsrs as createFsrs, createEmptyCard, Rating, State, generatorParameters, forgetting_curve } from 'ts-fsrs';
import type { Card as FsrsCard, Grade as FsrsGrade, RecordLogItem } from 'ts-fsrs';
import type { Grade, SrsCard, CardState } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULT_WEIGHTS = generatorParameters().w;

/** 缓存 FSRS 实例，参数不变时复用 */
let _cachedFsrs: ReturnType<typeof createFsrs> | null = null;
let _cachedKey = '';

function getFsrs(params: FsrsParams): ReturnType<typeof createFsrs> {
  const key = `${params.desiredRetention}|${params.weights?.join(',') ?? ''}`;
  if (_cachedKey === key && _cachedFsrs) return _cachedFsrs;
  _cachedFsrs = createFsrs({
    request_retention: params.desiredRetention,
    w: params.weights ?? DEFAULT_WEIGHTS,
    enable_fuzz: false,
    enable_short_term: false,
  });
  _cachedKey = key;
  return _cachedFsrs;
}

/** 4 档反馈 → FSRS Rating */
const GRADE_TO_RATING: Record<Grade, FsrsGrade> = {
  0: Rating.Again,
  1: Rating.Hard,
  2: Rating.Good,
  3: Rating.Easy,
};

/** FSRS State → app CardState */
function toCardState(s: State): CardState {
  switch (s) {
    case State.New: return 'new';
    case State.Learning: return 'learning';
    case State.Review: return 'review';
    case State.Relearning: return 'relearning';
    default: return 'new';
  }
}

/** app CardState → FSRS State */
function toFsrsState(s: CardState): State {
  switch (s) {
    case 'new': return State.New;
    case 'learning': return State.Learning;
    case 'review': return State.Review;
    case 'relearning': return State.Relearning;
    case 'suspended': return State.Review; // suspended 不参与调度，兜底 review
  }
}

export interface FsrsParams {
  desiredRetention: number;
  weights?: number[];
}

export interface FsrsResult {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  dueAt: number;
  state: CardState;
}

export function defaultCardSrs(now: number): FsrsResult {
  const card = createEmptyCard(new Date(now));
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    dueAt: now,
    state: 'new',
  };
}

/**
 * FSRS 调度核心：根据当前卡片状态和用户反馈计算下一次状态。
 * 纯函数：不读不写数据库。
 */
export function fsrs(card: SrsCard, grade: Grade, now: number, params: FsrsParams): FsrsResult {
  const f = getFsrs(params);

  const fsrsCard: FsrsCard = {
    due: new Date(card.dueAt),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: toFsrsState(card.state),
    last_review: card.lastReviewedAt ? new Date(card.lastReviewedAt) : undefined,
  };

  const result: RecordLogItem = f.next(fsrsCard, new Date(now), GRADE_TO_RATING[grade]);
  const { card: nextCard } = result;

  return {
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    elapsed_days: nextCard.elapsed_days,
    scheduled_days: nextCard.scheduled_days,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    dueAt: nextCard.due.getTime(),
    state: toCardState(nextCard.state),
  };
}

/**
 * SM-2 → FSRS 迁移：将旧 SM-2 字段映射为 FSRS 初值。
 * 不重置进度，平滑过渡。首次 FSRS 评分后会自动校准。
 */
export function migrateSm2ToFsrs(old: {
  ease: number;
  interval: number;
  repetitions: number;
  dueAt: number;
  state: string;
  lastReviewedAt?: number;
}): FsrsResult {
  // stability 近似：SM-2 interval 即下次到期间隔（天），≈ FSRS stability
  const stability = Math.max(0.1, old.interval);
  // difficulty 反推：SM-2 ease 范围 1.3~∞（典型 ≤4）→ FSRS difficulty 1~10
  // ease 高 = 记得牢 = difficulty 低；线性映射
  const difficulty = Math.min(10, Math.max(1, 11 - (old.ease - 1.3) * 2.5));
  const isReview = old.state === 'review';

  return {
    stability,
    difficulty,
    elapsed_days: isReview ? old.interval : 0,
    scheduled_days: isReview ? old.interval : 0,
    reps: old.repetitions,
    lapses: 0,
    dueAt: old.dueAt,
    // 'relearning' 在 SM-2 中不存在，映射到 'learning'
    state: (old.state as CardState) === 'review' ? 'review' : 'learning',
  };
}

/**
 * 计算单卡当前可提取率（retrievability）。
 * R(t) = (1 + FACTOR × t / (9·S))^DECAY
 */
export function retrievability(stability: number, elapsedDays: number, weights?: number[]): number {
  return forgetting_curve(weights ?? DEFAULT_WEIGHTS, elapsedDays, stability);
}

export const __testing__ = { MS_PER_DAY, GRADE_TO_RATING };
