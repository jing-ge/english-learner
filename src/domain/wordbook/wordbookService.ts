import { cardRepo } from '../../data/repositories/cardRepo';
import { wordRepo } from '../../data/repositories/wordRepo';
import { wordbookRepo } from '../../data/repositories/wordbookRepo';
import type { CardRecord, WordRecord, WordbookRecord } from '../../data/types';
import type { WordDraft } from './parseImport';

/**
 * 启用一个词书：
 *   - 该词书内的每个 word，若 cards 表已有同 id 的卡（来自其它词书启用），把当前 wordbookId 合并进 wordbooks 数组
 *   - 没卡则建一张 state='new' 的卡，wordbooks=[wordbookId]
 *
 * 已存在的 card（无论何种状态）保留学习进度。
 * 返回值 added 仅统计"新建"的卡（不含合并到老卡的次数）。
 */
export async function enableWordbook(wordbookId: string, now: number = Date.now()): Promise<{
  added: number;
}> {
  const words = await wordRepo.listByWordbook(wordbookId);
  const newCards: CardRecord[] = [];
  const toUpdate: CardRecord[] = [];
  for (const w of words) {
    const existing = await cardRepo.getById(w.id);
    if (existing) {
      if (!existing.wordbooks.includes(wordbookId)) {
        toUpdate.push({ ...existing, wordbooks: [...existing.wordbooks, wordbookId] });
      }
      continue;
    }
    newCards.push({
      id: w.id,
      wordId: w.id,
      wordbooks: [wordbookId],
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      dueAt: now,
      state: 'new',
      addedAt: now,
    });
  }
  if (newCards.length > 0) await cardRepo.bulkUpsert(newCards);
  if (toUpdate.length > 0) await cardRepo.bulkUpsert(toUpdate);
  return { added: newCards.length };
}

/**
 * 禁用一个词书：
 *   - 仅对 state='new' 的卡操作（已学过的 learning/review 保留学习进度，避免丢）
 *   - 卡的 wordbooks 数组若只含该 wordbookId，则删卡
 *   - 否则只把该 wordbookId 从数组中移除（仍保留卡，因其它启用词书还需要）
 *
 * 返回值 removed 仅统计"真正删卡"数（不含仅移除归属的）。
 */
export async function disableWordbook(wordbookId: string): Promise<{ removed: number }> {
  const cands = await wordRepo.listByWordbook(wordbookId);
  const toDelete: string[] = [];
  const toUpdate: CardRecord[] = [];
  for (const w of cands) {
    const card = await cardRepo.getById(w.id);
    if (!card || card.state !== 'new') continue;
    if (card.wordbooks.length <= 1) {
      toDelete.push(card.id);
    } else {
      toUpdate.push({
        ...card,
        wordbooks: card.wordbooks.filter((id) => id !== wordbookId),
      });
    }
  }
  if (toDelete.length > 0) {
    const { getDb } = await import('../../data/db');
    await getDb().cards.bulkDelete(toDelete);
  }
  if (toUpdate.length > 0) await cardRepo.bulkUpsert(toUpdate);
  return { removed: toDelete.length };
}

/**
 * 创建用户词书。流程：
 *   1. 生成 wordbookId（user_<slug>_<timestamp>）
 *   2. 注册 wordbook（source='user'）
 *   3. 把每个 draft 转成 WordRecord 入库；若 word 已存在（全局 id = word lowercase）
 *      则把当前 wordbookId 加进现有记录的 wordbooks[]
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

  const toCreate: WordRecord[] = [];
  const toMerge: WordRecord[] = [];
  for (const d of drafts) {
    const wordId = d.word.toLowerCase();
    const existing = await wordRepo.getById(wordId);
    if (existing) {
      if (!existing.wordbooks.includes(wordbookId)) {
        toMerge.push({ ...existing, wordbooks: [...existing.wordbooks, wordbookId] });
      }
      continue;
    }
    toCreate.push({
      id: wordId,
      word: d.word,
      phonetic: d.phonetic,
      translations: d.meaning ? [{ pos: d.pos, meaning: d.meaning }] : [],
      examples: [],
      collocations: [],
      wordbooks: [wordbookId],
    });
  }
  if (toCreate.length > 0) await wordRepo.bulkUpsert(toCreate);
  if (toMerge.length > 0) await wordRepo.bulkUpsert(toMerge);

  return { wordbookId, addedWords: toCreate.length + toMerge.length };
}

/**
 * 删除用户词书：
 *   - 仅允许删除 source='user'；built-in 不可删
 *   - 词书引用的 word：若该 word 仅属此词书，删 word + 删 card；否则仅从 wordbooks 数组移除该 id
 *
 * 返回值 removed 是"被处理的 word 总数"（含仅移归属的），保持与原契约一致。
 */
export async function deleteUserWordbook(wordbookId: string): Promise<{ removed: number }> {
  const book = await wordbookRepo.getById(wordbookId);
  if (!book) return { removed: 0 };
  if (book.source !== 'user') throw new Error('内置词书不可删除');

  const words = await wordRepo.listByWordbook(wordbookId);
  const wordsToDelete: string[] = [];
  const wordsToMerge: WordRecord[] = [];
  const cardsToDelete: string[] = [];
  const cardsToMerge: CardRecord[] = [];

  for (const w of words) {
    if (w.wordbooks.length <= 1) {
      wordsToDelete.push(w.id);
    } else {
      wordsToMerge.push({ ...w, wordbooks: w.wordbooks.filter((id) => id !== wordbookId) });
    }
    const card = await cardRepo.getById(w.id);
    if (card) {
      if (card.wordbooks.length <= 1) {
        cardsToDelete.push(card.id);
      } else {
        cardsToMerge.push({
          ...card,
          wordbooks: card.wordbooks.filter((id) => id !== wordbookId),
        });
      }
    }
  }

  const { getDb } = await import('../../data/db');
  const db = getDb();
  await db.transaction('rw', db.cards, db.words, db.wordbooks, async () => {
    if (cardsToDelete.length > 0) await db.cards.bulkDelete(cardsToDelete);
    if (cardsToMerge.length > 0) await db.cards.bulkPut(cardsToMerge);
    if (wordsToDelete.length > 0) await db.words.bulkDelete(wordsToDelete);
    if (wordsToMerge.length > 0) await db.words.bulkPut(wordsToMerge);
    await db.wordbooks.delete(wordbookId);
  });
  return { removed: words.length };
}
