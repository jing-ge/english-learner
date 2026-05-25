import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, getDb } from '../../data/db';
import { settingsRepo } from '../../data/repositories/settingsRepo';
import { cardRepo } from '../../data/repositories/cardRepo';
import { reviewLogRepo } from '../../data/repositories/reviewLogRepo';
import { wordbookRepo } from '../../data/repositories/wordbookRepo';
import { exportBackup, importBackup, BACKUP_VERSION, type BackupPayload } from './exportImport';

const NOW = 1_700_000_000_000;

beforeEach(async () => {
  await resetDb();
});

describe('exportBackup', () => {
  it('收集 cards / reviewLogs / settings / user wordbooks，跳过 builtin wordbooks', async () => {
    await wordbookRepo.upsert({ id: 'cet4', name: 'CET4', source: 'builtin', totalCount: 100 });
    await wordbookRepo.upsert({ id: 'mybook', name: 'My', source: 'user', totalCount: 5 });
    await cardRepo.upsert({
      id: 'a',
      wordId: 'a',
      wordbookId: 'cet4',
      ease: 2.5,
      interval: 1,
      repetitions: 1,
      dueAt: NOW,
      state: 'review',
      addedAt: NOW,
    });
    await reviewLogRepo.append({
      cardId: 'a',
      reviewedAt: NOW,
      grade: 3,
      prevInterval: 0,
      nextInterval: 1,
      durationMs: 100,
    });
    await settingsRepo.update({ dailyNewCount: 30 });

    const payload = await exportBackup(NOW);
    expect(payload.version).toBe(BACKUP_VERSION);
    expect(payload.exportedAt).toBe(NOW);
    expect(payload.cards).toHaveLength(1);
    expect(payload.reviewLogs).toHaveLength(1);
    expect(payload.userWordbooks).toHaveLength(1);
    expect(payload.userWordbooks[0].id).toBe('mybook');
    expect(payload.settings.dailyNewCount).toBe(30);
  });
});

describe('importBackup', () => {
  it('全量替换 cards/reviewLogs/settings/userWordbooks，保留 builtin wordbooks', async () => {
    // 设置初始状态
    await wordbookRepo.upsert({ id: 'cet4', name: 'CET4', source: 'builtin', totalCount: 100 });
    await wordbookRepo.upsert({ id: 'old', name: 'OldUserBook', source: 'user', totalCount: 1 });
    await cardRepo.upsert({
      id: 'should-be-gone',
      wordId: 'x',
      wordbookId: 'cet4',
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      dueAt: NOW,
      state: 'new',
      addedAt: NOW,
    });

    const payload: BackupPayload = {
      version: BACKUP_VERSION,
      exportedAt: NOW,
      settings: {
        id: 1,
        dailyNewCount: 50,
        dailyReviewCap: 200,
        activeWordbookIds: ['cet4'],
        ttsAccent: 'uk',
        theme: 'auto',
      },
      cards: [
        {
          id: 'imported',
          wordId: 'imported',
          wordbookId: 'cet4',
          ease: 2.5,
          interval: 6,
          repetitions: 2,
          dueAt: NOW + 1000,
          state: 'review',
          addedAt: NOW,
        },
      ],
      reviewLogs: [
        {
          cardId: 'imported',
          reviewedAt: NOW,
          grade: 3,
          prevInterval: 1,
          nextInterval: 6,
          durationMs: 200,
        },
      ],
      userWordbooks: [{ id: 'newbook', name: 'NewUser', source: 'user', totalCount: 0 }],
    };

    const r = await importBackup(payload);
    expect(r.cards).toBe(1);
    expect(r.reviewLogs).toBe(1);
    expect(r.userWordbooks).toBe(1);

    const db = getDb();
    expect(await db.cards.toArray()).toHaveLength(1);
    expect((await db.cards.toArray())[0].id).toBe('imported');
    expect(await db.reviewLogs.count()).toBe(1);

    const settings = await settingsRepo.get();
    expect(settings.dailyNewCount).toBe(50);
    expect(settings.ttsAccent).toBe('uk');

    const books = await db.wordbooks.toArray();
    const ids = books.map((b) => b.id).sort();
    expect(ids).toEqual(['cet4', 'newbook']); // 'old' 被清除，'cet4' builtin 保留
  });

  it('版本不匹配时抛错', async () => {
    const bad = { version: 999 } as unknown as BackupPayload;
    await expect(importBackup(bad)).rejects.toThrow(/不支持的备份版本/);
  });

  it('round-trip：导出后导入还原', async () => {
    await cardRepo.upsert({
      id: 'a',
      wordId: 'a',
      wordbookId: 'cet4',
      ease: 2.7,
      interval: 6,
      repetitions: 2,
      dueAt: NOW + 6 * 86400000,
      state: 'review',
      addedAt: NOW,
    });
    await settingsRepo.update({ dailyNewCount: 25 });

    const exported = await exportBackup(NOW);
    await resetDb();

    await importBackup(exported);
    const card = await cardRepo.getById('a');
    expect(card?.ease).toBeCloseTo(2.7, 5);
    expect(card?.repetitions).toBe(2);
    const settings = await settingsRepo.get();
    expect(settings.dailyNewCount).toBe(25);
  });
});
