import { cardRepo } from '../../data/repositories/cardRepo';
import { wordRepo } from '../../data/repositories/wordRepo';
import { wordbookRepo } from '../../data/repositories/wordbookRepo';
import type { CardRecord, WordRecord, WordbookRecord } from '../../data/types';
import type { WordDraft } from './parseImport';

/**
 * 启用一个词书：把该词书内尚未在 cards 表的 word 注入为 state='new'。
 * 已存在的 card（无论何种状态）保留。
 */
export async function enableWordbook(wordbookId: string, now: number = Date.now()): Promise<{
  added: number;
}> {
  const words = await wordRepo.listByWordbook(wordbookId);
  const newCards: CardRecord[] = [];
  for (const w of words) {
    const existing = await cardRepo.getById(w.id);
    if (existing) continue;
    newCards.push({
      id: w.id,
      wordId: w.id,
      wordbookId,
      ease: 2.5,
      interval: 0,
      repetitions: 0,
      dueAt: now,
      state: 'new',
      addedAt: now,
    });
  }
  if (newCards.length > 0) await cardRepo.bulkUpsert(newCards);
  return { added: newCards.length };
}

/**
 * 禁用一个词书：删除该词书内 state='new' 的卡（用户没学过的）。
 * 已学过的（learning/review/suspended）保留，避免丢进度。
 */
export async function disableWordbook(wordbookId: string): Promise<{ removed: number }> {
  const removed = await cardRepo.deleteByWordbookAndState(wordbookId, 'new');
  return { removed };
}

/**
 * 创建用户词书。流程：
 *   1. 生成 wordbookId（user_<slug>_<timestamp>）
 *   2. 注册 wordbook（source='user'）
 *   3. 把每个 draft 转成 WordRecord 入库；若 word 已存在则把当前 wordbookId 加进 wordbooks[]
 *   4. 不自动注入 cards（由调用方决定要不要立刻 enable）
 *
 * 释义/音标空时由 StudyView 的 enrichWord 在线兜底。
 */
export async function createUserWordbook(
  name: string,
  drafts: WordDraft[],
  description?: string,
  now: number = Date.now(),
): Promise<{ wordbookId: string; addedWords: number }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('词书名不能为空');
  if (drafts.length === 0) throw new Error('词条列表为空');

  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'list';
  const wordbookId = `user_${slug}_${now.toString(36)}`;
  const book: WordbookRecord = {
    id: wordbookId,
    name: trimmed,
    source: 'user',
    totalCount: drafts.length,
    description: description ?? `用户词书 · ${drafts.length} 词`,
  };
  await wordbookRepo.upsert(book);

  const toUpsert: WordRecord[] = [];
  for (const d of drafts) {
    const wordId = `${wordbookId}_${d.word.replace(/\s+/g, '_')}`;
    const existing = await wordRepo.getById(wordId);
    if (existing) {
      // 同一词书内重复，跳过（parseImport 已去重，这里防御）
      continue;
    }
    toUpsert.push({
      id: wordId,
      word: d.word,
      phonetic: d.phonetic,
      translations: d.meaning
        ? [{ pos: d.pos, meaning: d.meaning }]
        : [],
      examples: [],
      collocations: [],
      wordbooks: [wordbookId],
    });
  }
  if (toUpsert.length > 0) await wordRepo.bulkUpsert(toUpsert);

  return { wordbookId, addedWords: toUpsert.length };
}

/**
 * 删除用户词书：移除 wordbook 记录、该词书所属 words、对应的 cards。
 * 仅允许删除 source='user' 的；built-in 不可删。
 */
export async function deleteUserWordbook(wordbookId: string): Promise<{ removed: number }> {
  const book = await wordbookRepo.getById(wordbookId);
  if (!book) return { removed: 0 };
  if (book.source !== 'user') throw new Error('内置词书不可删除');

  const words = await wordRepo.listByWordbook(wordbookId);
  const wordIds = words.map((w) => w.id);

  // 直接删除该词书的所有 cards（无论 state，因为词条本身要删）
  const { getDb } = await import('../../data/db');
  const db = getDb();
  await db.transaction('rw', db.cards, db.words, db.wordbooks, async () => {
    if (wordIds.length > 0) {
      await db.cards.where('id').anyOf(wordIds).delete();
      await db.words.where('id').anyOf(wordIds).delete();
    }
    await db.wordbooks.delete(wordbookId);
  });
  return { removed: wordIds.length };
}
