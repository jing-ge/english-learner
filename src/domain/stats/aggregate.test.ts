import { describe, it, expect } from 'vitest';
import { bucketByDay, summarize, heatLevels } from './aggregate';
import type { ReviewLogRecord } from '../../data/types';

const DAY = 24 * 60 * 60 * 1000;

function log(reviewedAt: number, grade: 0 | 1 | 2 | 3, durationMs = 1000): ReviewLogRecord {
  return {
    cardId: 'c',
    reviewedAt,
    grade,
    prevInterval: 0,
    nextInterval: 1,
    durationMs,
  };
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

describe('bucketByDay', () => {
  const now = startOfDay(Date.now()) + 12 * 60 * 60 * 1000; // 中午

  it('生成连续 N 天的桶，缺天填 0', () => {
    const buckets = bucketByDay([], 7, now);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.reviews === 0)).toBe(true);
    // 桶按天升序，最后一个是今天
    const today = startOfDay(now);
    expect(buckets[6].dayStart).toBe(today);
    expect(buckets[0].dayStart).toBe(today - 6 * DAY);
  });

  it('正确归入对应日期', () => {
    const today = startOfDay(now);
    const logs: ReviewLogRecord[] = [
      log(today + 1000, 3, 500),
      log(today + 2000, 0, 300),
      log(today - DAY + 1000, 2, 200),
    ];
    const buckets = bucketByDay(logs, 3, now);
    expect(buckets[2].reviews).toBe(2);
    expect(buckets[2].correct).toBe(1); // 一条 grade=3, 一条 grade=0
    expect(buckets[2].durationMs).toBe(800);
    expect(buckets[1].reviews).toBe(1);
    expect(buckets[1].correct).toBe(1);
  });

  it('忽略窗口外的日志', () => {
    const today = startOfDay(now);
    const logs = [log(today - 30 * DAY, 3), log(today + 1000, 3)];
    const buckets = bucketByDay(logs, 7, now);
    const total = buckets.reduce((s, b) => s + b.reviews, 0);
    expect(total).toBe(1);
  });
});

describe('summarize', () => {
  it('计算总数与正确率', () => {
    const t = Date.now();
    const logs = [log(t - 1000, 3), log(t - 2000, 1), log(t - 3000, 2), log(t - 4000, 0)];
    const s = summarize(logs, t - 10000, t);
    expect(s.totalReviews).toBe(4);
    expect(s.totalCorrect).toBe(2);
    expect(s.accuracy).toBeCloseTo(0.5);
  });

  it('窗口为空返回 0 不报错', () => {
    const s = summarize([], 0, 1);
    expect(s.totalReviews).toBe(0);
    expect(s.accuracy).toBe(0);
  });

  it('activeDays 按不同的天计数', () => {
    const today = startOfDay(Date.now());
    const logs = [log(today, 3), log(today + 1000, 2), log(today - DAY, 3)];
    const s = summarize(logs, today - 10 * DAY, today + DAY);
    expect(s.activeDays).toBe(2);
  });
});

describe('heatLevels', () => {
  it('全 0 返回全 0', () => {
    const b = bucketByDay([], 5, Date.now());
    expect(heatLevels(b)).toEqual([0, 0, 0, 0, 0]);
  });

  it('按最大值分位映射到 1..4', () => {
    const today = startOfDay(Date.now());
    const logs: ReviewLogRecord[] = [];
    // day 0: 1, day 1: 5, day 2: 10, day 3: 0, day 4: 20
    for (let i = 0; i < 1; i++) logs.push(log(today - 4 * DAY, 3));
    for (let i = 0; i < 5; i++) logs.push(log(today - 3 * DAY, 3));
    for (let i = 0; i < 10; i++) logs.push(log(today - 2 * DAY, 3));
    for (let i = 0; i < 20; i++) logs.push(log(today, 3));
    const b = bucketByDay(logs, 5, today);
    const levels = heatLevels(b);
    // max=20: 1/20=5%→1; 5/20=25%→1; 10/20=50%→2; 0→0; 20/20=100%→4
    expect(levels).toEqual([1, 1, 2, 0, 4]);
  });
});
