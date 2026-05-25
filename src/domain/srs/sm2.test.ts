import { describe, it, expect } from 'vitest';
import { sm2, defaultCardSrs, __testing__ } from './sm2';
import type { Grade, SrsCard } from '../types';

const { MS_PER_DAY, MIN_EASE, DEFAULT_EASE } = __testing__;
const NOW = 1_700_000_000_000;

function makeCard(overrides: Partial<SrsCard> = {}): SrsCard {
  return {
    ease: DEFAULT_EASE,
    interval: 0,
    repetitions: 0,
    dueAt: NOW,
    state: 'new',
    ...overrides,
  };
}

describe('sm2 - 成功路径 (grade=3, quality=5)', () => {
  it('第 1 次成功：interval=1, repetitions=1, ease 上升', () => {
    const r = sm2(makeCard(), 3, NOW);
    expect(r.repetitions).toBe(1);
    expect(r.interval).toBe(1);
    expect(r.dueAt).toBe(NOW + MS_PER_DAY);
    expect(r.ease).toBeGreaterThan(DEFAULT_EASE);
    expect(r.state).toBe('review');
  });

  it('第 2 次成功：interval=6', () => {
    const c = makeCard({ ease: DEFAULT_EASE, interval: 1, repetitions: 1, state: 'review' });
    const r = sm2(c, 3, NOW);
    expect(r.repetitions).toBe(2);
    expect(r.interval).toBe(6);
    expect(r.dueAt).toBe(NOW + 6 * MS_PER_DAY);
  });

  it('第 3 次成功：interval = round(prevInterval * ease)', () => {
    const c = makeCard({ ease: 2.5, interval: 6, repetitions: 2, state: 'review' });
    const r = sm2(c, 3, NOW);
    expect(r.repetitions).toBe(3);
    // ease 在 quality=5 时增加约 0.1：2.5 + 0.1 = 2.6
    expect(r.ease).toBeCloseTo(2.6, 5);
    expect(r.interval).toBe(Math.round(6 * 2.6)); // 16
  });
});

describe('sm2 - 中等路径 (grade=2, quality=3)', () => {
  it('quality=3 是成功阈值，ease 不变', () => {
    const r = sm2(makeCard(), 2, NOW);
    expect(r.state).toBe('review');
    // 公式: 2.5 + (0.1 - 2*(0.08 + 2*0.02)) = 2.5 + (0.1 - 0.24) = 2.36
    expect(r.ease).toBeCloseTo(2.36, 5);
    expect(r.interval).toBe(1);
  });
});

describe('sm2 - 失败路径 (grade<2)', () => {
  it.each<[Grade]>([[0], [1]])('grade=%i 失败：interval=1, repetitions=0, 状态=learning', (g) => {
    const c = makeCard({ ease: 2.5, interval: 30, repetitions: 5, state: 'review' });
    const r = sm2(c, g, NOW);
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(1);
    expect(r.state).toBe('learning');
    expect(r.dueAt).toBe(NOW + MS_PER_DAY);
  });

  it('连续按 0 多次，ease 单调下降但不低于 1.3', () => {
    let c = makeCard({ ease: 2.5 });
    for (let i = 0; i < 50; i++) {
      const r = sm2(c, 0, NOW);
      expect(r.ease).toBeGreaterThanOrEqual(MIN_EASE);
      c = { ...c, ...r };
    }
    expect(c.ease).toBe(MIN_EASE);
  });
});

describe('sm2 - 边界', () => {
  it('已经在 ease=1.3 的卡再失败仍 >=1.3', () => {
    const r = sm2(makeCard({ ease: MIN_EASE }), 0, NOW);
    expect(r.ease).toBe(MIN_EASE);
  });

  it('成功时 ease 上限不被显式约束（论文未规定上限）', () => {
    let c = makeCard({ ease: 2.5 });
    for (let i = 0; i < 10; i++) {
      const r = sm2(c, 3, NOW);
      c = { ...c, ...r };
    }
    expect(c.ease).toBeGreaterThan(2.5);
  });

  it('dueAt 严格等于 now + interval*MS_PER_DAY', () => {
    const r = sm2(makeCard({ interval: 6, repetitions: 2, ease: 2.5 }), 3, NOW);
    expect(r.dueAt - NOW).toBe(r.interval * MS_PER_DAY);
  });
});

describe('defaultCardSrs', () => {
  it('返回新卡默认值', () => {
    const r = defaultCardSrs(NOW);
    expect(r.ease).toBe(DEFAULT_EASE);
    expect(r.interval).toBe(0);
    expect(r.repetitions).toBe(0);
    expect(r.state).toBe('new');
    expect(r.dueAt).toBe(NOW);
  });
});
