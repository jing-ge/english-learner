import { describe, it, expect } from 'vitest';
import {
  forecastDueByDay,
  forecastRetention,
  ebbinghausBaseline,
} from './forecast';
import type { CardRecord } from '@/data/types';

const DAY = 86_400_000;
const T0 = new Date('2026-05-25T08:00:00').getTime();

function card(over: Partial<CardRecord>): CardRecord {
  return {
    id: 'a',
    wordId: 'a',
    wordbooks: ['cet4'],
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    dueAt: T0,
    state: 'review',
    addedAt: T0 - 30 * DAY,
    lastReviewedAt: T0 - DAY,
    ...over,
  };
}

describe('forecastDueByDay', () => {
  it('生成 days 长度的桶', () => {
    const r = forecastDueByDay([], 7, T0);
    expect(r).toHaveLength(7);
    expect(r.every((p) => p.dueCount === 0)).toBe(true);
    expect(r[0].dayOffset).toBe(0);
    expect(r[6].dayOffset).toBe(6);
  });

  it('按 dueAt 落到正确的天桶', () => {
    const cards = [
      card({ id: 'today', dueAt: T0 }),
      card({ id: 'tomorrow', dueAt: T0 + DAY }),
      card({ id: 'day3', dueAt: T0 + 2 * DAY }),
      card({ id: 'day3b', dueAt: T0 + 2 * DAY + 1000 }),
    ];
    const r = forecastDueByDay(cards, 7, T0);
    expect(r[0].dueCount).toBe(1);
    expect(r[1].dueCount).toBe(1);
    expect(r[2].dueCount).toBe(2);
    expect(r[3].dueCount).toBe(0);
  });

  it('已逾期卡归并到今天 (dayOffset=0)', () => {
    const cards = [
      card({ id: 'overdue1', dueAt: T0 - 5 * DAY }),
      card({ id: 'overdue2', dueAt: T0 - DAY }),
    ];
    const r = forecastDueByDay(cards, 7, T0);
    expect(r[0].dueCount).toBe(2);
  });

  it('忽略 new / suspended 卡', () => {
    const cards = [
      card({ id: 'n', state: 'new', dueAt: T0 }),
      card({ id: 's', state: 'suspended', dueAt: T0 }),
      card({ id: 'r', state: 'review', dueAt: T0 }),
    ];
    expect(forecastDueByDay(cards, 7, T0)[0].dueCount).toBe(1);
  });

  it('relearning 卡纳入到期统计', () => {
    const cards = [
      card({ id: 'rl', state: 'relearning', dueAt: T0 }),
    ];
    expect(forecastDueByDay(cards, 7, T0)[0].dueCount).toBe(1);
  });
});

describe('forecastRetention', () => {
  it('空学习集合返回 0', () => {
    const r = forecastRetention([], 5, T0);
    expect(r.every((p) => p.retention === 0)).toBe(true);
  });

  it('刚学过的（stability=1）今天接近 1，30 天后明显衰减', () => {
    const c = card({ stability: 1, lastReviewedAt: T0 });
    const r = forecastRetention([c], 30, T0);
    expect(r[0].retention).toBeGreaterThan(0.9);
    expect(r[29].retention).toBeLessThan(0.7);
  });

  it('stability=30 的稳定卡 30 天衰减更慢', () => {
    const c = card({ stability: 30, lastReviewedAt: T0 });
    const r = forecastRetention([c], 30, T0);
    expect(r[29].retention).toBeGreaterThan(0.3);
  });

  it('忽略未学过 (无 lastReviewedAt) 的卡', () => {
    const learned = card({ stability: 30, lastReviewedAt: T0 });
    const fresh = card({ id: 'fresh', state: 'new', lastReviewedAt: undefined });
    const r1 = forecastRetention([learned], 30, T0);
    const r2 = forecastRetention([learned, fresh], 30, T0);
    expect(r1[15].retention).toBeCloseTo(r2[15].retention, 3);
  });

  it('relearning 卡纳入留存率计算', () => {
    const c = card({ id: 'rl', state: 'relearning', stability: 5, lastReviewedAt: T0 });
    const r = forecastRetention([c], 7, T0);
    expect(r[0].retention).toBeGreaterThan(0);
  });
});

describe('ebbinghausBaseline', () => {
  it('单调递减且初值接近 1', () => {
    const r = ebbinghausBaseline(30);
    expect(r[0].retention).toBeCloseTo(1, 1);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].retention).toBeLessThan(r[i - 1].retention);
    }
  });
});
