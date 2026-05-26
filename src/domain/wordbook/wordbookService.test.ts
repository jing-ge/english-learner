import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../../data/db';
import { loadSeedWordbook, makeWordId, type SeedWordbook } from '../../data/seed/loader';
import {
  enableWordbook,
  disableWordbook,
  createUserWordbook,
  deleteUserWordbook,
} from './wordbookService';
import { cardRepo } from '../../data/repositories/cardRepo';
import { wordRepo } from '../../data/repositories/wordRepo';
import { wordbookRepo } from '../../data/repositories/wordbookRepo';

const seed: SeedWordbook = {
  id: 'cet4',
  name: 'CET4',
  words: [
    { word: 'apple', translations: [{ meaning: '苹果' }] },
    { word: 'banana', translations: [{ meaning: '香蕉' }] },
    { word: 'cherry', translations: [{ meaning: '樱桃' }] },
  ],
};

const seed2: SeedWordbook = {
  id: 'kaoyan',
  name: 'Kaoyan',
  words: [
    { word: 'apple', translations: [{ meaning: '苹果（共享词）' }] },
    { word: 'desk', translations: [{ meaning: '桌子' }] },
  ],
};

beforeEach(async () => {
  await resetDb();
  await loadSeedWordbook(seed);
});

describe('enableWordbook', () => {
  it('首次启用注入全部词为 new 卡，wordbooks=[id]', async () => {
    const r = await enableWordbook('cet4');
    expect(r.added).toBe(3);
    const cards = await cardRepo.listByState('new');
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.state === 'new' && c.wordbooks.includes('cet4'))).toBe(true);
  });

  it('再次启用不会重复注入', async () => {
    await enableWordbook('cet4');
    const r2 = await enableWordbook('cet4');
    expect(r2.added).toBe(0);
    const all = await cardRepo.listByState('new');
    expect(all).toHaveLength(3);
  });

  it('已学过的卡（review）再次启用时不会被回退', async () => {
    await enableWordbook('cet4');
    const cards = await cardRepo.listByState('new');
    const first = cards[0];
    await cardRepo.upsert({ ...first, state: 'review', reps: 3, scheduled_days: 7 });

    await enableWordbook('cet4');

    const updated = await cardRepo.getById(first.id);
    expect(updated?.state).toBe('review');
    expect(updated?.reps).toBe(3);
  });

  it('启用第二本含共享词的词书，已存在的卡 wordbooks 数组合并而非建新卡', async () => {
    await enableWordbook('cet4');
    await loadSeedWordbook(seed2);

    const r = await enableWordbook('kaoyan');
    // apple 已存在（来自 cet4），仅合并；只有 desk 是新建
    expect(r.added).toBe(1);

    const apple = await cardRepo.getById(makeWordId('apple'));
    expect(apple?.wordbooks.sort()).toEqual(['cet4', 'kaoyan']);
    const desk = await cardRepo.getById(makeWordId('desk'));
    expect(desk?.wordbooks).toEqual(['kaoyan']);
  });
});

describe('disableWordbook', () => {
  it('只删 state=new 的卡，learning/review 保留', async () => {
    await enableWordbook('cet4');
    const cards = await cardRepo.listByState('new');
    await cardRepo.upsert({ ...cards[0], state: 'review' });
    await cardRepo.upsert({ ...cards[1], state: 'learning' });

    const r = await disableWordbook('cet4');
    expect(r.removed).toBe(1); // 只剩第三张是 new

    const after = await cardRepo.listAllActive(['cet4']);
    expect(after.map((c) => c.state).sort()).toEqual(['learning', 'review']);
  });

  it('多书归属时只移 wordbooks 数组里的 id，不删卡', async () => {
    await enableWordbook('cet4');
    await loadSeedWordbook(seed2);
    await enableWordbook('kaoyan');

    // apple 现在 wordbooks=['cet4','kaoyan']
    const r = await disableWordbook('kaoyan');
    // desk 独属 kaoyan 被删；apple 仅移除 kaoyan 归属
    expect(r.removed).toBe(1);

    const apple = await cardRepo.getById(makeWordId('apple'));
    expect(apple).toBeDefined();
    expect(apple?.wordbooks).toEqual(['cet4']);
    const desk = await cardRepo.getById(makeWordId('desk'));
    expect(desk).toBeUndefined();
  });
});

describe('createUserWordbook', () => {
  it('注册 user 词书并写入 words', async () => {
    const r = await createUserWordbook('My List', [
      { word: 'serendipity', meaning: '机缘巧合' },
      { word: 'ephemeral', pos: 'adj.', meaning: '短暂的', phonetic: '/ɪˈfem.ər.əl/' },
    ]);
    expect(r.addedWords).toBe(2);

    const book = await wordbookRepo.getById(r.wordbookId);
    expect(book?.source).toBe('user');
    expect(book?.totalCount).toBe(2);

    const words = await wordRepo.listByWordbook(r.wordbookId);
    expect(words.map((w) => w.word).sort()).toEqual(['ephemeral', 'serendipity']);
    const eph = words.find((w) => w.word === 'ephemeral');
    expect(eph?.phonetic).toBe('/ɪˈfem.ər.əl/');
    expect(eph?.translations[0]).toMatchObject({ pos: 'adj.', meaning: '短暂的' });
  });

  it('空名或空 drafts 报错', async () => {
    await expect(createUserWordbook('', [{ word: 'x' }])).rejects.toThrow(/词书名/);
    await expect(createUserWordbook('Foo', [])).rejects.toThrow(/词条/);
  });

  it('启用 user 词书后可注入卡片', async () => {
    const r = await createUserWordbook('UL', [{ word: 'foo' }, { word: 'bar' }]);
    const en = await enableWordbook(r.wordbookId);
    expect(en.added).toBe(2);
  });

  it('user 词书包含已存在的全局词时合并 wordbooks 而非建新 word', async () => {
    // seed 已写入 apple
    const r = await createUserWordbook('UL', [
      { word: 'apple', meaning: '我的苹果' },
      { word: 'novel', meaning: '小说' },
    ]);
    expect(r.addedWords).toBe(2); // 合并 + 新建合计

    const apple = await wordRepo.getById(makeWordId('apple'));
    expect(apple?.wordbooks.sort()).toEqual(['cet4', r.wordbookId].sort());
    // 不覆盖已有 translations
    expect(apple?.translations[0].meaning).toBe('苹果');
  });
});

describe('deleteUserWordbook', () => {
  it('删除 user 词书：移除 wordbook + 独占的 words/cards', async () => {
    const r = await createUserWordbook('UL', [{ word: 'alpha' }, { word: 'beta' }]);
    await enableWordbook(r.wordbookId);

    const del = await deleteUserWordbook(r.wordbookId);
    expect(del.removed).toBe(2);
    expect(await wordbookRepo.getById(r.wordbookId)).toBeUndefined();
    const remainCards = await cardRepo.listAllActive([r.wordbookId]);
    expect(remainCards).toHaveLength(0);
    expect(await wordRepo.getById(makeWordId('alpha'))).toBeUndefined();
  });

  it('共享词只移 wordbooks 数组中该 id，不删 word/card', async () => {
    // user 词书包含 cet4 已有的 apple
    const r = await createUserWordbook('UL', [{ word: 'apple' }, { word: 'unique' }]);
    await enableWordbook('cet4');
    await enableWordbook(r.wordbookId);

    const del = await deleteUserWordbook(r.wordbookId);
    expect(del.removed).toBe(2); // 处理了两个词

    // apple 仍存在，仅移除 user wordbook
    const apple = await wordRepo.getById(makeWordId('apple'));
    expect(apple).toBeDefined();
    expect(apple?.wordbooks).toEqual(['cet4']);
    const appleCard = await cardRepo.getById(makeWordId('apple'));
    expect(appleCard).toBeDefined();
    expect(appleCard?.wordbooks).toEqual(['cet4']);

    // unique 独属 user 词书，被删
    expect(await wordRepo.getById(makeWordId('unique'))).toBeUndefined();
    expect(await cardRepo.getById(makeWordId('unique'))).toBeUndefined();
  });

  it('内置词书拒绝删除', async () => {
    await expect(deleteUserWordbook('cet4')).rejects.toThrow(/内置/);
  });
});
