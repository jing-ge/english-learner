import type { Translation, Example, Collocation, WordRecord, WordbookRecord } from '../types';
import { wordRepo } from '../repositories/wordRepo';
import { wordbookRepo } from '../repositories/wordbookRepo';

/**
 * 种子词书 JSON 的 schema：
 *   { id, name, description?, words: SeedWord[] }
 *
 * SeedWord 不含 id（由 wordbookId + word 派生），不含 wordbooks 字段
 * （由加载器注入），让 JSON 写起来更紧凑。
 */
export interface SeedWord {
  word: string;
  phonetic?: string;
  translations: Translation[];
  examples?: Example[];
  collocations?: Collocation[];
  audioUrl?: string;
  freqRank?: number;
}

export interface SeedWordbook {
  id: string;
  name: string;
  description?: string;
  words: SeedWord[];
}

/**
 * 把种子词书写入 wordbooks + words 表。
 * - words 表：用 patch 语义，不会覆盖用户/网络已经填充的字段（保护懒加载结果）
 * - wordbooks 表：直接 upsert
 *
 * 注意：本函数仅维护 words/wordbooks。把词条转成用户的 cards（state='new'）
 * 是另一个流程（首启选词书时执行），不在这里处理。
 */
export async function loadSeedWordbook(seed: SeedWordbook): Promise<{
  wordbookId: string;
  wordsLoaded: number;
}> {
  const wordRecords: WordRecord[] = seed.words.map((w) => ({
    id: makeWordId(seed.id, w.word),
    word: w.word,
    phonetic: w.phonetic,
    translations: w.translations,
    examples: w.examples,
    collocations: w.collocations,
    audioUrl: w.audioUrl,
    wordbooks: [seed.id],
    freqRank: w.freqRank,
  }));

  const book: WordbookRecord = {
    id: seed.id,
    name: seed.name,
    source: 'builtin',
    totalCount: seed.words.length,
    description: seed.description,
  };

  await wordbookRepo.upsert(book);

  // 对已存在的 word 做 wordbooks 合并 + 空字段填充；新词直接 put
  for (const rec of wordRecords) {
    const existing = await wordRepo.getById(rec.id);
    if (!existing) {
      await wordRepo.bulkUpsert([rec]);
    } else {
      const mergedBooks = Array.from(new Set([...existing.wordbooks, ...rec.wordbooks]));
      await wordRepo.bulkUpsert([{ ...existing, wordbooks: mergedBooks }]);
      await wordRepo.patchEmptyFields(rec.id, {
        phonetic: rec.phonetic,
        examples: rec.examples,
        collocations: rec.collocations,
        audioUrl: rec.audioUrl,
        translations: rec.translations,
      });
    }
  }

  return { wordbookId: seed.id, wordsLoaded: wordRecords.length };
}

export function makeWordId(wordbookId: string, word: string): string {
  return `${wordbookId}_${word.toLowerCase()}`;
}
