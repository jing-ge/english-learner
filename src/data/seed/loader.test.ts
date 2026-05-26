import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetDb } from '../db';
import { loadSeedWordbook, makeWordId, type SeedWordbook } from './loader';
import { wordRepo } from '../repositories/wordRepo';
import { wordbookRepo } from '../repositories/wordbookRepo';
import { ensureBuiltinSeeds, loadDerivedAndEnrich } from './index';

// 测试环境无法加载 sql.js wasm + 真实 ECDICT，listByTag 强制返回空
// 让派生词书静默跳过，仅验证 loader 逻辑
vi.mock('../../platform/localDict', () => ({
  listByTag: vi.fn(async () => []),
  lookup: vi.fn(async () => null),
  ensureLocalDict: vi.fn(async () => null),
  batchLookupFreq: vi.fn(() => new Map()),
  isReady: () => false,
  lookupSync: () => null,
}));

beforeEach(async () => {
  await resetDb();
});

describe('loadSeedWordbook', () => {
  const seed: SeedWordbook = {
    id: 'test',
    name: 'Test Book',
    words: [
      { word: 'hello', translations: [{ meaning: '你好' }], freqRank: 1 },
      { word: 'world', translations: [{ meaning: '世界' }], freqRank: 2 },
    ],
  };

  it('写入 wordbooks 与 words 记录（id = word lowercase）', async () => {
    const r = await loadSeedWordbook(seed);
    expect(r.wordsLoaded).toBe(2);

    const book = await wordbookRepo.getById('test');
    expect(book?.name).toBe('Test Book');
    expect(book?.source).toBe('builtin');
    expect(book?.totalCount).toBe(2);

    const w = await wordRepo.getById(makeWordId('hello'));
    expect(w?.id).toBe('hello');
    expect(w?.word).toBe('hello');
    expect(w?.wordbooks).toEqual(['test']);
    expect(w?.freqRank).toBe(1);
  });

  it('再次加载相同词不会覆盖现有非空字段，且合并 wordbooks 数组', async () => {
    await loadSeedWordbook(seed);
    const id = makeWordId('hello');
    const w0 = await wordRepo.getById(id);
    await wordRepo.bulkUpsert([{ ...w0!, phonetic: '/həˈləʊ/' }]);

    const seed2: SeedWordbook = {
      id: 'test2',
      name: 'Test Book 2',
      words: [{ word: 'hello', translations: [{ meaning: '另一个释义' }], phonetic: '/IGNORED/' }],
    };
    await loadSeedWordbook(seed2);

    const w = await wordRepo.getById(id);
    expect(w?.phonetic).toBe('/həˈləʊ/'); // 不覆盖
    expect(w?.wordbooks?.sort()).toEqual(['test', 'test2']); // 归属合并
  });

  it('version 递增时触发重灌，更新 totalCount', async () => {
    await loadSeedWordbook({ id: 'vtest', name: 'V1', version: 1, words: [
      { word: 'apple', translations: [{ meaning: '苹果' }] },
    ] });
    const book1 = await wordbookRepo.getById('vtest');
    expect(book1?.totalCount).toBe(1);

    // version 升级，词数增加
    await loadSeedWordbook({ id: 'vtest', name: 'V2', version: 2, words: [
      { word: 'apple', translations: [{ meaning: '苹果' }] },
      { word: 'banana', translations: [{ meaning: '香蕉' }] },
    ] });
    const book2 = await wordbookRepo.getById('vtest');
    expect(book2?.totalCount).toBe(2);
  });
});

describe('ensureBuiltinSeeds', () => {
  it('ECDICT 不可用时无词书注册，不报错', async () => {
    await ensureBuiltinSeeds();
    const books = await wordbookRepo.listBuiltin();
    expect(books.length).toBe(0);
  });

  it('mock listByTag 返回数据时派生词书会注册', async () => {
    const { listByTag } = await import('../../platform/localDict');
    (listByTag as ReturnType<typeof vi.fn>).mockImplementation(async (tag: string) => {
      if (tag === 'cet4') {
        return [
          { word: 'abandon', phonetic: '/əˈbændən/', translations: [{ meaning: '放弃' }] },
          { word: 'ability', translations: [{ meaning: '能力' }] },
        ];
      }
      if (tag === 'gre') {
        return [
          { word: 'fictitious', phonetic: '/fɪkˈtɪʃəs/', translations: [{ meaning: '虚构的' }] },
          { word: 'gambit', translations: [{ meaning: '开局' }] },
        ];
      }
      return [];
    });
    await ensureBuiltinSeeds();
    // 派生词书在后台异步加载，需等待完成
    const existing = await wordbookRepo.listBuiltin();
    const byId = new Map(existing.map((b) => [b.id, b]));
    await loadDerivedAndEnrich(byId);
    const books = await wordbookRepo.listBuiltin();
    expect(books.map((b) => b.id).sort()).toEqual(['cet4', 'gre']);

    const greBook = books.find((b) => b.id === 'gre');
    expect(greBook?.totalCount).toBe(2);
    const fic = await wordRepo.getById(makeWordId('fictitious'));
    expect(fic?.wordbooks).toContain('gre');
    expect(fic?.freqRank).toBe(1);

    // 还原默认 mock 给后续 case 用
    (listByTag as ReturnType<typeof vi.fn>).mockImplementation(async () => []);
  }, 60000);

  it('同词在多本词书中只存一份，wordbooks 数组合并', async () => {
    const { listByTag } = await import('../../platform/localDict');
    (listByTag as ReturnType<typeof vi.fn>).mockImplementation(async (tag: string) => {
      if (tag === 'cet4') {
        return [{ word: 'abandon', translations: [{ meaning: '放弃' }] }];
      }
      if (tag === 'ky') {
        return [{ word: 'abandon', translations: [{ meaning: '放弃' }] }];
      }
      return [];
    });
    await ensureBuiltinSeeds();
    const existing = await wordbookRepo.listBuiltin();
    const byId = new Map(existing.map((b) => [b.id, b]));
    await loadDerivedAndEnrich(byId);
    const w = await wordRepo.getById(makeWordId('abandon'));
    expect(w?.wordbooks?.sort()).toEqual(['cet4', 'ky']);

    (listByTag as ReturnType<typeof vi.fn>).mockImplementation(async () => []);
  }, 60000);

  it('已有词书版本号足够时跳过，不重复加载', async () => {
    const { listByTag } = await import('../../platform/localDict');
    (listByTag as ReturnType<typeof vi.fn>).mockImplementation(async (tag: string) => {
      if (tag === 'cet4') {
        return [{ word: 'abandon', translations: [{ meaning: '放弃' }] }];
      }
      return [];
    });
    await ensureBuiltinSeeds();
    const existing = await wordbookRepo.listBuiltin();
    const byId = new Map(existing.map((b) => [b.id, b]));
    await loadDerivedAndEnrich(byId);

    // 二次启动：版本号一致，不应重复加载
    const existing2 = await wordbookRepo.listBuiltin();
    const byId2 = new Map(existing2.map((b) => [b.id, b]));
    await loadDerivedAndEnrich(byId2);

    const books = await wordbookRepo.listBuiltin();
    expect(books.length).toBe(1); // 不重复注册

    (listByTag as ReturnType<typeof vi.fn>).mockImplementation(async () => []);
  }, 60000);
});
