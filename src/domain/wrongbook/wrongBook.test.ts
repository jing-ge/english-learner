import { describe, it, expect } from 'vitest';
import { deriveWrongCardIds, summarizeWrong } from './wrongBook';
import type { ReviewLogRecord } from '../../data/types';

const DAY = 24 * 60 * 60 * 1000;

function log(cardId: string, ts: number, grade: 0 | 1 | 2 | 3): ReviewLogRecord {
  return { cardId, reviewedAt: ts, grade, prevInterval: 0, nextInterval: 1, durationMs: 100 };
}

describe('deriveWrongCardIds', () => {
  const now = 10 * DAY;

  it('最近一次评分 <=1 的视为错词', () => {
    const logs = [
      log('a', now - 1000, 0),
      log('b', now - 1000, 2),
      log('c', now - 1000, 1),
    ];
    expect(new Set(deriveWrongCardIds(logs, 14, now))).toEqual(new Set(['a', 'c']));
  });

  it('上次错、本次对：恢复，从错词本移除', () => {
    const logs = [
      log('a', now - 2 * DAY, 0),
      log('a', now - 1000, 3),
    ];
    expect(deriveWrongCardIds(logs, 14, now)).toEqual([]);
  });

  it('上次对、本次错：进入错词本', () => {
    const logs = [
      log('a', now - 2 * DAY, 3),
      log('a', now - 1000, 1),
    ];
    expect(deriveWrongCardIds(logs, 14, now)).toEqual(['a']);
  });

  it('窗口外的日志被忽略', () => {
    const logs = [log('old', now - 100 * DAY, 0)];
    expect(deriveWrongCardIds(logs, 14, now)).toEqual([]);
  });

  it('maxGrade=0 仅"不会"算错；maxGrade=2 连"模糊"也算', () => {
    const logs = [
      log('only0', now - 1000, 0),
      log('soft', now - 1000, 1), // 模糊
      log('mid', now - 1000, 2), // 一般
      log('good', now - 1000, 3),
    ];
    expect(new Set(deriveWrongCardIds(logs, 14, now, 0))).toEqual(new Set(['only0']));
    expect(new Set(deriveWrongCardIds(logs, 14, now, 1))).toEqual(new Set(['only0', 'soft']));
    expect(new Set(deriveWrongCardIds(logs, 14, now, 2))).toEqual(new Set(['only0', 'soft', 'mid']));
  });
});

describe('summarizeWrong', () => {
  const now = 10 * DAY;

  it('排序：错次降序、再按最近时间', () => {
    const logs = [
      log('a', now - 5 * DAY, 0), log('a', now - 4 * DAY, 0), log('a', now - 1000, 1), // wrong=3
      log('b', now - 3 * DAY, 0), log('b', now - 500, 0), // wrong=2
      log('c', now - 100, 1), // wrong=1
    ];
    const out = summarizeWrong(logs, 14, now);
    expect(out.map((s) => s.cardId)).toEqual(['a', 'b', 'c']);
    expect(out[0].wrongCount).toBe(3);
  });

  it('最近一次 grade>=2 的卡不进入', () => {
    const logs = [log('x', now - 2000, 0), log('x', now - 1000, 3)];
    expect(summarizeWrong(logs, 14, now)).toEqual([]);
  });

  it('maxGrade=2 时 grade=2 也计入错次', () => {
    const logs = [
      log('a', now - 1000, 0),
      log('a', now - 500, 2), // 最近一次=2，maxGrade=2 时应进入
    ];
    const r = summarizeWrong(logs, 14, now, 2);
    expect(r).toHaveLength(1);
    expect(r[0].cardId).toBe('a');
    expect(r[0].wrongCount).toBe(2); // 0 和 2 都算
  });
});
