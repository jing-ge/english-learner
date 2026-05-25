/**
 * 遗忘曲线相关纯函数。
 *
 * 两条曲线：
 *   1. forecastDueByDay(cards, days, now)
 *      根据 cards.dueAt 推演未来 N 天每天会到期复习多少张。
 *      只看 state=learning|review，skip new/suspended。
 *      横轴：天偏移 0..N-1；纵轴：到期数量。
 *
 *   2. ebbinghausRetention(daysSinceLearn)
 *      经典 Ebbinghaus 公式：R(t) = e^(-t/S)，t 单位天，S 是 stability。
 *      未复习时 S=1（强度 1）；用作"不复习会忘多少"的对比基线。
 *      给定单词数组的 lastReviewedAt 与 interval（=stability 近似），
 *      可以加权平均出当前批次的"如果今天起完全不复习，T 天后还能记多少"。
 */

import type { CardRecord } from '@/data/types';

export interface ForecastPoint {
  /** 距离 now 的天偏移：0=今天, 1=明天, ... */
  dayOffset: number;
  /** 该天到期复习的卡片数 */
  dueCount: number;
  /** 距离 now 的日期戳 yyyy-mm-dd（本地时区）用于 tooltip */
  date: string;
}

export interface RetentionPoint {
  /** 距离 now 的天偏移 */
  dayOffset: number;
  /** 「不复习」假设下，该批卡今天到 dayOffset 天后的平均留存率 0..1 */
  retention: number;
}

const DAY_MS = 86_400_000;

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function ymd(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 计算未来 days 天每天到期数。dueAt 早于今天的也算到「今天 (offset 0)」（积压未复习）。
 */
export function forecastDueByDay(
  cards: CardRecord[],
  days: number,
  now: number = Date.now(),
): ForecastPoint[] {
  const start = startOfLocalDay(now);
  const buckets: number[] = new Array(days).fill(0);
  for (const c of cards) {
    if (c.state !== 'learning' && c.state !== 'review') continue;
    const dueDay = startOfLocalDay(c.dueAt);
    let offset = Math.round((dueDay - start) / DAY_MS);
    if (offset < 0) offset = 0; // 已逾期归到今天
    if (offset >= days) continue;
    buckets[offset] += 1;
  }
  return buckets.map((cnt, i) => ({
    dayOffset: i,
    dueCount: cnt,
    date: ymd(start + i * DAY_MS),
  }));
}

/**
 * 计算「不再复习」假设下，已学卡片群体未来 days 天的平均留存率曲线。
 *
 * 数学模型：
 *   - 单卡留存率 R = e^(-Δt / S)，Δt 是从今天起的天数 + （今天距上次复习的天数），
 *     S 用 max(card.interval, 1) 作为 stability 近似（SM-2 interval 越长记得越牢）
 *   - 群体留存 = 算术平均 单卡留存率（粗糙但直观）
 *
 * 没有 lastReviewedAt 的卡（new/未学）跳过。
 */
export function forecastRetention(
  cards: CardRecord[],
  days: number,
  now: number = Date.now(),
): RetentionPoint[] {
  const learned = cards.filter(
    (c) => (c.state === 'learning' || c.state === 'review') && c.lastReviewedAt,
  );
  if (learned.length === 0) {
    return Array.from({ length: days }, (_, i) => ({ dayOffset: i, retention: 0 }));
  }
  const points: RetentionPoint[] = [];
  for (let d = 0; d < days; d++) {
    let sum = 0;
    for (const c of learned) {
      const lastReviewed = c.lastReviewedAt!;
      const sinceReviewDays = Math.max(0, (now - lastReviewed) / DAY_MS) + d;
      const stability = Math.max(c.interval, 1);
      sum += Math.exp(-sinceReviewDays / stability);
    }
    points.push({ dayOffset: d, retention: sum / learned.length });
  }
  return points;
}

/**
 * 经典 Ebbinghaus（无复习）参考曲线：S=1 day stability。
 * 用来在图上画一条「完全不复习会忘多少」的灰色基线。
 */
export function ebbinghausBaseline(days: number): RetentionPoint[] {
  return Array.from({ length: days }, (_, d) => ({
    dayOffset: d,
    retention: Math.exp(-d / 1.5), // 1.5 是经验拟合
  }));
}
