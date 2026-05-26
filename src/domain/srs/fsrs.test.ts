import { describe, it, expect } from 'vitest';
import { fsrs, defaultCardSrs, migrateSm2ToFsrs, retrievability } from './fsrs';
import type { Grade, SrsCard } from '../types';

const NOW = 1_700_000_000_000;
const PARAMS = { desiredRetention: 0.9 };

function makeCard(overrides: Partial<SrsCard> = {}): SrsCard {
  return {
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    dueAt: NOW,
    state: 'new',
    ...overrides,
  };
}

describe('defaultCardSrs', () => {
  it('返回新卡默认值', () => {
    const r = defaultCardSrs(NOW);
    expect(r.stability).toBe(0);
    expect(r.difficulty).toBe(0);
    expect(r.reps).toBe(0);
    expect(r.lapses).toBe(0);
    expect(r.state).toBe('new');
    expect(r.dueAt).toBe(NOW);
  });
});

describe('fsrs - 成功路径 (grade=3, Easy)', () => {
  it('新卡 grade=3 后变为 review，reps≥1，scheduled_days≥1', () => {
    const r = fsrs(makeCard(), 3, NOW, PARAMS);
    expect(r.state).toBe('review');
    expect(r.reps).toBeGreaterThanOrEqual(1);
    expect(r.scheduled_days).toBeGreaterThanOrEqual(1);
  });
});

describe('fsrs - 模糊路径 (grade=2, Good)', () => {
  it('新卡 grade=2 后变为 review', () => {
    const r = fsrs(makeCard(), 2, NOW, PARAMS);
    expect(r.state).toBe('review');
    expect(r.reps).toBeGreaterThanOrEqual(1);
  });
});

describe('fsrs - 失败路径 (grade<2)', () => {
  it.each<[Grade]>([[0], [1]])('grade=%i 新卡评分后状态不为 new', (g) => {
    const r = fsrs(makeCard(), g, NOW, PARAMS);
    expect(r.state).not.toBe('new');
    expect(r.lapses).toBeGreaterThanOrEqual(0);
  });

  it('review 卡失败后 lapses 增加', () => {
    const c = makeCard({ state: 'review', reps: 3, stability: 10, difficulty: 5, lapses: 0 });
    const r = fsrs(c, 0, NOW, PARAMS);
    expect(r.lapses).toBe(1);
  });
});

describe('fsrs - stability 单调性', () => {
  it('成功评分后 stability 不低于初始稳定度', () => {
    const c = makeCard({ state: 'review', stability: 10, difficulty: 5, reps: 3 });
    const r = fsrs(c, 3, NOW, PARAMS);
    expect(r.stability).toBeGreaterThan(0);
  });
});

describe('migrateSm2ToFsrs', () => {
  it('映射 SM-2 → FSRS 字段，review 卡保留状态', () => {
    const r = migrateSm2ToFsrs({
      ease: 2.5,
      interval: 7,
      repetitions: 3,
      dueAt: NOW,
      state: 'review',
      lastReviewedAt: NOW - 86400000,
    });
    expect(r.stability).toBe(7);
    expect(r.state).toBe('review');
    expect(r.reps).toBe(3);
    expect(r.difficulty).toBeGreaterThanOrEqual(1);
    expect(r.difficulty).toBeLessThanOrEqual(10);
  });

  it('new/learning 卡映射到 learning', () => {
    const r = migrateSm2ToFsrs({
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      dueAt: NOW,
      state: 'new',
    });
    expect(r.state).toBe('learning');
    expect(r.stability).toBe(0.1); // max(0.1, 0)
  });

  it('ease 极低（1.3）→ difficulty 高', () => {
    const r = migrateSm2ToFsrs({ ease: 1.3, interval: 1, repetitions: 0, dueAt: NOW, state: 'review' });
    expect(r.difficulty).toBeGreaterThanOrEqual(8);
  });
});

describe('retrievability', () => {
  it('elapsed_days=0 时接近 1', () => {
    const r = retrievability(10, 0);
    expect(r).toBeCloseTo(1, 3);
  });

  it('elapsed_days 远大于 stability 时明显衰减', () => {
    const r = retrievability(1, 100);
    expect(r).toBeLessThan(0.6);
  });

  it('单调递减', () => {
    const r1 = retrievability(10, 1);
    const r2 = retrievability(10, 5);
    const r3 = retrievability(10, 20);
    expect(r1).toBeGreaterThan(r2);
    expect(r2).toBeGreaterThan(r3);
  });
});
