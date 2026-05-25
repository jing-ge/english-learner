import { describe, it, expect } from 'vitest';
import { buildTodaySession } from './scheduler';
import type { CardRecord } from '../../data/types';
import type { CardState } from '../types';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function card(id: string, overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    id,
    wordId: id,
    wordbookId: 'cet4',
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    dueAt: NOW,
    state: 'new' as CardState,
    addedAt: NOW,
    ...overrides,
  };
}

describe('buildTodaySession', () => {
  it('空输入返回空数组', () => {
    const out = buildTodaySession({
      settings: { dailyNewCount: 20, dailyReviewCap: 200, activeWordbookIds: ['cet4'] },
      allCards: [],
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it('只取 active 词书的卡', () => {
    const cards = [
      card('a', { state: 'review', dueAt: NOW - DAY, wordbookId: 'cet4' }),
      card('b', { state: 'review', dueAt: NOW - DAY, wordbookId: 'kaoyan' }),
    ];
    const out = buildTodaySession({
      settings: { dailyNewCount: 20, dailyReviewCap: 200, activeWordbookIds: ['cet4'] },
      allCards: cards,
      now: NOW,
    });
    expect(out.map((c) => c.id)).toEqual(['a']);
  });

  it('reviews 仅包含到期的（dueAt <= now）', () => {
    const cards = [
      card('past', { state: 'review', dueAt: NOW - DAY }),
      card('today', { state: 'review', dueAt: NOW }),
      card('future', { state: 'review', dueAt: NOW + DAY }),
    ];
    const out = buildTodaySession({
      settings: { dailyNewCount: 0, dailyReviewCap: 200, activeWordbookIds: ['cet4'] },
      allCards: cards,
      now: NOW,
    });
    expect(out.map((c) => c.id)).toEqual(['past', 'today']);
  });

  it('reviews 按 dueAt 升序，受 dailyReviewCap 截断', () => {
    const cards = [
      card('c', { state: 'review', dueAt: NOW - DAY }),
      card('a', { state: 'review', dueAt: NOW - 3 * DAY }),
      card('b', { state: 'review', dueAt: NOW - 2 * DAY }),
    ];
    const out = buildTodaySession({
      settings: { dailyNewCount: 0, dailyReviewCap: 2, activeWordbookIds: ['cet4'] },
      allCards: cards,
      now: NOW,
    });
    expect(out.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('news 按 freqRank 升序，未提供时按 wordId 字典序', () => {
    const cards = [card('zebra'), card('apple'), card('mango')];
    const out = buildTodaySession({
      settings: { dailyNewCount: 10, dailyReviewCap: 200, activeWordbookIds: ['cet4'] },
      allCards: cards,
      now: NOW,
    });
    expect(out.map((c) => c.id)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('news 按 freqRank 优先', () => {
    const cards = [card('zebra'), card('apple'), card('mango')];
    const ranks = new Map([
      ['mango', 1],
      ['apple', 2],
      ['zebra', 3],
    ]);
    const out = buildTodaySession({
      settings: { dailyNewCount: 10, dailyReviewCap: 200, activeWordbookIds: ['cet4'] },
      allCards: cards,
      freqRankByWord: ranks,
      now: NOW,
    });
    expect(out.map((c) => c.id)).toEqual(['mango', 'apple', 'zebra']);
  });

  it('news 受 dailyNewCount 限制', () => {
    const cards = Array.from({ length: 50 }, (_, i) =>
      card(`w${String(i).padStart(2, '0')}`),
    );
    const out = buildTodaySession({
      settings: { dailyNewCount: 5, dailyReviewCap: 200, activeWordbookIds: ['cet4'] },
      allCards: cards,
      now: NOW,
    });
    expect(out).toHaveLength(5);
  });

  it('混合输出顺序：reviews → learnings 穿插 → news 末尾', () => {
    const reviews = ['r1', 'r2', 'r3', 'r4'].map((id) =>
      card(id, { state: 'review', dueAt: NOW - DAY }),
    );
    const learnings = ['L1'].map((id) => card(id, { state: 'learning', dueAt: NOW - DAY }));
    const news = ['n1', 'n2'].map((id) => card(id));

    const out = buildTodaySession({
      settings: { dailyNewCount: 10, dailyReviewCap: 200, activeWordbookIds: ['cet4'] },
      allCards: [...reviews, ...learnings, ...news],
      now: NOW,
    });

    // reviews 全在 learnings 之前的 review 区，news 全在末尾
    const ids = out.map((c) => c.id);
    const lastReviewIdx = ids.lastIndexOf('r4');
    const firstNewIdx = ids.indexOf('n1');
    expect(firstNewIdx).toBeGreaterThan(lastReviewIdx);
    // L1 出现且在 news 之前
    expect(ids.indexOf('L1')).toBeGreaterThan(-1);
    expect(ids.indexOf('L1')).toBeLessThan(firstNewIdx);
    // 总数正确
    expect(out).toHaveLength(reviews.length + learnings.length + news.length);
  });

  it('activeWordbookIds 为空时不过滤', () => {
    const cards = [card('a'), card('b', { wordbookId: 'kaoyan' })];
    const out = buildTodaySession({
      settings: { dailyNewCount: 20, dailyReviewCap: 200, activeWordbookIds: [] },
      allCards: cards,
      now: NOW,
    });
    expect(out).toHaveLength(2);
  });

  it('suspended 状态的卡被忽略', () => {
    const cards = [card('a', { state: 'suspended' })];
    const out = buildTodaySession({
      settings: { dailyNewCount: 20, dailyReviewCap: 200, activeWordbookIds: ['cet4'] },
      allCards: cards,
      now: NOW,
    });
    expect(out).toEqual([]);
  });
});
