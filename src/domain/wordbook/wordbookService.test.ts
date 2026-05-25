import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../../data/db';
import { loadSeedWordbook, type SeedWordbook } from '../../data/seed/loader';
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

beforeEach(async () => {
  await resetDb();
  await loadSeedWordbook(seed);
});

describe('enableWordbook', () => {
  it('首次启用注入全部词为 new 卡', async () => {
    const r = await enableWordbook('cet4');
    expect(r.added).toBe(3);
    const cards = await cardRepo.listByState('new');
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.state === 'new' && c.wordbookId === 'cet4')).toBe(true);
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
    await cardRepo.upsert({ ...first, state: 'review', repetitions: 3, interval: 7 });

    await enableWordbook('cet4');

    const updated = await cardRepo.getById(first.id);
    expect(updated?.state).toBe('review');
    expect(updated?.repetitions).toBe(3);
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
});

describe('deleteUserWordbook', () => {
  it('删除 user 词书：移除 wordbook + words + cards', async () => {
    const r = await createUserWordbook('UL', [{ word: 'alpha' }, { word: 'beta' }]);
    await enableWordbook(r.wordbookId);

    const del = await deleteUserWordbook(r.wordbookId);
    expect(del.removed).toBe(2);
    expect(await wordbookRepo.getById(r.wordbookId)).toBeUndefined();
    const remainCards = await cardRepo.listAllActive([r.wordbookId]);
    expect(remainCards).toHaveLength(0);
  });

  it('内置词书拒绝删除', async () => {
    await expect(deleteUserWordbook('cet4')).rejects.toThrow(/内置/);
  });
});
