import { describe, it, expect } from 'vitest';
import { computeStreak } from './streak';
import type { ReviewLogRecord } from '../../data/types';

const DAY = 24 * 60 * 60 * 1000;

function log(ts: number): ReviewLogRecord {
  return {
    cardId: 'x',
    reviewedAt: ts,
    grade: 3,
    prevInterval: 0,
    nextInterval: 1,
    durationMs: 100,
  };
}

describe('computeStreak', () => {
  const NOON = (() => {
    const d = new Date('2026-05-25T12:00:00');
    return d.getTime();
  })();

  it('无日志为 0', () => {
    expect(computeStreak([], NOON)).toBe(0);
  });

  it('只今天学了：1', () => {
    expect(computeStreak([log(NOON)], NOON)).toBe(1);
  });

  it('今天没学但昨天学了：1（避免凌晨清零）', () => {
    expect(computeStreak([log(NOON - DAY)], NOON)).toBe(1);
  });

  it('连续 5 天每天都学了：5', () => {
    const logs: ReviewLogRecord[] = [];
    for (let i = 0; i < 5; i++) logs.push(log(NOON - i * DAY));
    expect(computeStreak(logs, NOON)).toBe(5);
  });

  it('中间断了一天：从最近的连续段算', () => {
    const logs: ReviewLogRecord[] = [log(NOON), log(NOON - DAY), log(NOON - 3 * DAY)];
    expect(computeStreak(logs, NOON)).toBe(2);
  });

  it('同一天多条只算一天', () => {
    const logs: ReviewLogRecord[] = [log(NOON), log(NOON + 1000), log(NOON + 5_000)];
    expect(computeStreak(logs, NOON)).toBe(1);
  });
});
