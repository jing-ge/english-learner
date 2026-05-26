import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, getDb } from '../db';
import { cardRepo } from './cardRepo';
import { settingsRepo } from './settingsRepo';
import { wordRepo } from './wordRepo';
import { reviewLogRepo } from './reviewLogRepo';
import { wordbookRepo } from './wordbookRepo';
import type { CardRecord, WordRecord } from '../types';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function card(id: string, overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    id,
    wordId: id,
    wordbooks: ['cet4'],
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    dueAt: NOW,
    state: 'new',
    addedAt: NOW,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
});

describe('settingsRepo', () => {
  it('get() 首次返回默认值并写入', async () => {
    const s = await settingsRepo.get();
    expect(s.id).toBe(1);
    expect(s.dailyNewCount).toBe(20);
    expect(s.dailyReviewCap).toBe(200);
    const inDb = await getDb().settings.get(1);
    expect(inDb).toBeDefined();
  });

  it('update() 合并字段', async () => {
    await settingsRepo.get();
    const next = await settingsRepo.update({ dailyNewCount: 30, ttsAccent: 'uk' });
    expect(next.dailyNewCount).toBe(30);
    expect(next.ttsAccent).toBe('uk');
    expect(next.dailyReviewCap).toBe(200);
    expect(next.id).toBe(1);
  });
});

describe('cardRepo - 复合索引 [state+dueAt]', () => {
  it('listDueReviews 仅返回 state=review 且 dueAt<=now', async () => {
    await cardRepo.bulkUpsert([
      card('a', { state: 'review', dueAt: NOW - 2 * DAY }),
      card('b', { state: 'review', dueAt: NOW - DAY }),
      card('c', { state: 'review', dueAt: NOW + DAY }), // 未到期
      card('d', { state: 'new', dueAt: NOW - DAY }), // 错状态
      card('e', { state: 'learning', dueAt: NOW - DAY }),
    ]);
    const due = await cardRepo.listDueReviews(NOW);
    const ids = due.map((c) => c.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('listDueReviews limit 截断', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      card(`r${i}`, { state: 'review', dueAt: NOW - (i + 1) * DAY }),
    );
    await cardRepo.bulkUpsert(many);
    const out = await cardRepo.listDueReviews(NOW, 3);
    expect(out).toHaveLength(3);
  });
});

describe('cardRepo - 词书过滤', () => {
  it('listAllActive 按 wordbooks 多值索引过滤', async () => {
    await cardRepo.bulkUpsert([
      card('a', { wordbooks: ['cet4'] }),
      card('b', { wordbooks: ['kaoyan'] }),
      card('c', { wordbooks: ['ielts'] }),
    ]);
    const out = await cardRepo.listAllActive(['cet4', 'kaoyan']);
    expect(out.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('listAllActive 一卡多书时仅返回一次（distinct）', async () => {
    await cardRepo.bulkUpsert([
      card('shared', { wordbooks: ['cet4', 'kaoyan'] }),
      card('only_cet4', { wordbooks: ['cet4'] }),
    ]);
    const out = await cardRepo.listAllActive(['cet4', 'kaoyan']);
    expect(out.map((c) => c.id).sort()).toEqual(['only_cet4', 'shared']);
  });

  it('listAllActive 空数组返回全部', async () => {
    await cardRepo.bulkUpsert([card('a'), card('b', { wordbooks: ['kaoyan'] })]);
    const out = await cardRepo.listAllActive([]);
    expect(out).toHaveLength(2);
  });

  it('listByStateAndWordbooks 过滤 state + wordbooks', async () => {
    await cardRepo.bulkUpsert([
      card('a', { wordbooks: ['cet4'], state: 'new' }),
      card('b', { wordbooks: ['cet4'], state: 'review' }),
      card('c', { wordbooks: ['kaoyan'], state: 'new' }),
      card('d', { wordbooks: ['ielts'], state: 'new' }),
    ]);
    const out = await cardRepo.listByStateAndWordbooks('new', ['cet4', 'kaoyan']);
    expect(out.map((c) => c.id).sort()).toEqual(['a', 'c']);
  });

  it('deleteByWordbookAndState 只删 state + 该词书归属（不考虑独占）', async () => {
    await cardRepo.bulkUpsert([
      card('a', { wordbooks: ['cet4'], state: 'new' }),
      card('b', { wordbooks: ['cet4'], state: 'review' }),
      card('c', { wordbooks: ['kaoyan'], state: 'new' }),
    ]);
    const deleted = await cardRepo.deleteByWordbookAndState('cet4', 'new');
    expect(deleted).toBe(1);
    const remaining = await getDb().cards.toArray();
    expect(remaining.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });
});

describe('wordRepo', () => {
  function w(id: string, overrides: Partial<WordRecord> = {}): WordRecord {
    return {
      id,
      word: id,
      translations: [{ meaning: id }],
      wordbooks: ['cet4'],
      ...overrides,
    };
  }

  it('listByWordbook 走多值索引', async () => {
    await wordRepo.bulkUpsert([
      w('apple', { wordbooks: ['cet4', 'kaoyan'] }),
      w('zebra', { wordbooks: ['cet4'] }),
      w('mango', { wordbooks: ['ielts'] }),
    ]);
    const cet4 = await wordRepo.listByWordbook('cet4');
    expect(cet4.map((x) => x.id).sort()).toEqual(['apple', 'zebra']);
    const ielts = await wordRepo.listByWordbook('ielts');
    expect(ielts.map((x) => x.id)).toEqual(['mango']);
  });

  it('patchEmptyFields 只填空字段，不覆盖', async () => {
    await wordRepo.bulkUpsert([w('apple', { phonetic: '/a/', audioUrl: undefined })]);
    await wordRepo.patchEmptyFields('apple', {
      phonetic: '/SHOULD-NOT-OVERRIDE/',
      audioUrl: 'https://x/a.mp3',
    });
    const got = await wordRepo.getById('apple');
    expect(got?.phonetic).toBe('/a/');
    expect(got?.audioUrl).toBe('https://x/a.mp3');
  });
});

describe('reviewLogRepo', () => {
  it('append 自增 id 并能按时间查询', async () => {
    const id1 = await reviewLogRepo.append({
      cardId: 'a',
      reviewedAt: NOW - DAY,
      grade: 3,
      prevInterval: 0,
      nextInterval: 1,
      durationMs: 1000,
    });
    const id2 = await reviewLogRepo.append({
      cardId: 'a',
      reviewedAt: NOW,
      grade: 2,
      prevInterval: 1,
      nextInterval: 1,
      durationMs: 2000,
    });
    expect(id2).toBeGreaterThan(id1);

    const recent = await reviewLogRepo.listSince(NOW - DAY / 2);
    expect(recent).toHaveLength(1);
    expect(recent[0].cardId).toBe('a');

    const count = await reviewLogRepo.countSince(NOW - 2 * DAY);
    expect(count).toBe(2);
  });
});

describe('wordbookRepo', () => {
  it('upsert + listBuiltin', async () => {
    await wordbookRepo.upsert({
      id: 'cet4',
      name: 'CET4 核心',
      source: 'builtin',
      totalCount: 3000,
    });
    await wordbookRepo.upsert({
      id: 'mybook',
      name: '我的',
      source: 'user',
      totalCount: 10,
    });
    const builtin = await wordbookRepo.listBuiltin();
    expect(builtin.map((b) => b.id)).toEqual(['cet4']);
  });
});
