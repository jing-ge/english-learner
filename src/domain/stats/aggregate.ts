import type { ReviewLogRecord } from '../../data/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyBucket {
  /** 当日 0:00 的时间戳，作为稳定的天 key */
  dayStart: number;
  /** 当日复习次数（包括 grade 0..3 全部） */
  reviews: number;
  /** 当日认识次数（grade >= 2） */
  correct: number;
  /** 当日学习时长（毫秒） */
  durationMs: number;
}

export interface RangeSummary {
  /** 时间窗口内总复习次数 */
  totalReviews: number;
  /** 总认识次数 */
  totalCorrect: number;
  /** 正确率（0..1）；窗口为空时为 0 */
  accuracy: number;
  /** 累计学习时长（毫秒） */
  totalDurationMs: number;
  /** 学习了几天（有 review 记录的不重复日数） */
  activeDays: number;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 把日志按天聚合到固定长度的桶里：从 (today - days + 1) 到 today，缺天填 0。
 * 返回升序数组，最后一个元素就是今天。
 */
export function bucketByDay(
  logs: ReviewLogRecord[],
  days: number,
  now: number = Date.now(),
): DailyBucket[] {
  const today = startOfDay(now);
  const start = today - (days - 1) * DAY_MS;

  const buckets: DailyBucket[] = [];
  for (let i = 0; i < days; i++) {
    buckets.push({
      dayStart: start + i * DAY_MS,
      reviews: 0,
      correct: 0,
      durationMs: 0,
    });
  }

  for (const l of logs) {
    const day = startOfDay(l.reviewedAt);
    if (day < start || day > today) continue;
    const idx = Math.round((day - start) / DAY_MS);
    if (idx < 0 || idx >= buckets.length) continue;
    const b = buckets[idx];
    b.reviews += 1;
    if (l.grade >= 2) b.correct += 1;
    b.durationMs += Math.max(0, l.durationMs ?? 0);
  }
  return buckets;
}

/** 给定窗口的整体汇总（不分天）。 */
export function summarize(
  logs: ReviewLogRecord[],
  windowStart: number,
  windowEnd: number = Date.now(),
): RangeSummary {
  let totalReviews = 0;
  let totalCorrect = 0;
  let totalDurationMs = 0;
  const days = new Set<number>();
  for (const l of logs) {
    if (l.reviewedAt < windowStart || l.reviewedAt > windowEnd) continue;
    totalReviews += 1;
    if (l.grade >= 2) totalCorrect += 1;
    totalDurationMs += Math.max(0, l.durationMs ?? 0);
    days.add(startOfDay(l.reviewedAt));
  }
  return {
    totalReviews,
    totalCorrect,
    accuracy: totalReviews === 0 ? 0 : totalCorrect / totalReviews,
    totalDurationMs,
    activeDays: days.size,
  };
}

/**
 * 把 buckets 映射到热力图色阶等级 0..4。
 * 0 = 没学，1..4 按当窗口最大值的分位划分。
 */
export function heatLevels(buckets: DailyBucket[]): number[] {
  const max = buckets.reduce((m, b) => Math.max(m, b.reviews), 0);
  if (max === 0) return buckets.map(() => 0);
  return buckets.map((b) => {
    if (b.reviews === 0) return 0;
    const ratio = b.reviews / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  });
}

export const __testing__ = { startOfDay, DAY_MS };
