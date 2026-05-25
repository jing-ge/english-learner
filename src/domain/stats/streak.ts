import type { ReviewLogRecord } from '../../data/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 计算连续打卡天数：从 today 倒推，每天若有至少 1 条 reviewLog 则计数 +1，
 * 一旦中断立刻停止。今天没学习也算从昨天起算（避免凌晨打开就清零）。
 */
export function computeStreak(logs: ReviewLogRecord[], now: number = Date.now()): number {
  if (logs.length === 0) return 0;
  const days = new Set<number>();
  for (const l of logs) days.add(startOfDay(l.reviewedAt));

  const today = startOfDay(now);
  let cursor = today;
  let streak = 0;
  // 今天若没学，从昨天起算
  if (!days.has(today)) cursor = today - DAY_MS;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export const __testing__ = { startOfDay };
