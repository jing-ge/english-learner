import type { Translation, Example, Collocation, WordRecord, WordbookRecord } from '../types';
import { wordRepo } from '../repositories/wordRepo';
import { wordbookRepo } from '../repositories/wordbookRepo';

/**
 * 种子词书 JSON 的 schema：
 *   { id, name, description?, words: SeedWord[] }
 *
 * SeedWord 不含 id（由 word lowercase 派生），不含 wordbooks 字段
 * （由加载器注入），让 JSON 写起来更紧凑。
 *
 * v2 起：WordRecord.id = word.toLowerCase()，全局唯一。同词被多本词书引用时
 * 通过 wordbooks 数组合并，避免重复存储和重复学习。
 */
export interface SeedWord {
  word: string;
  phonetic?: string;
  translations: Translation[];
  examples?: Example[];
  collocations?: Collocation[];
  audioUrl?: string;
  freqRank?: number;
  bnc?: number;
  frq?: number;
}

export interface SeedWordbook {
  id: string;
  name: string;
  description?: string;
  /** 种子数据版本号，每次词条增删改都应递增。配合 ensureBuiltinSeeds 触发增量重灌。 */
  version?: number;
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
    id: makeWordId(w.word),
    word: w.word,
    phonetic: w.phonetic,
    translations: w.translations,
    examples: w.examples,
    collocations: w.collocations,
    audioUrl: w.audioUrl,
    wordbooks: [seed.id],
    freqRank: w.freqRank,
    bnc: w.bnc,
    frq: w.frq,
  }));

  const book: WordbookRecord = {
    id: seed.id,
    name: seed.name,
    source: 'builtin',
    totalCount: seed.words.length,
    description: seed.description,
    seedVersion: seed.version,
  };

  await wordbookRepo.upsert(book);

  // 批量读已存在词，再合并 wordbooks + 空字段补全，最后一次 bulkPut。
  // N 词时把 3N 次 round-trip 收敛到 2 次（bulkGet + bulkPut）。
  const ids = wordRecords.map((r) => r.id);
  const existingList = await wordRepo.bulkGet(ids);
  const existingMap = new Map<string, WordRecord>();
  for (const e of existingList) if (e) existingMap.set(e.id, e);

  const merged: WordRecord[] = wordRecords.map((rec) => {
    const existing = existingMap.get(rec.id);
    if (!existing) return rec;
    const out: WordRecord = { ...existing };
    const wbSet = new Set<string>([...(existing.wordbooks ?? []), ...rec.wordbooks]);
    out.wordbooks = Array.from(wbSet);
    // patchEmptyFields 语义：仅当现有字段为空才用新值
    const fillIfEmpty = <K extends keyof WordRecord>(k: K, v: WordRecord[K] | undefined): void => {
      if (v === undefined) return;
      const cur = out[k] as unknown;
      const isEmpty =
        cur === undefined || cur === null || (Array.isArray(cur) && cur.length === 0) || cur === '';
      if (isEmpty) out[k] = v as WordRecord[K];
    };
    fillIfEmpty('phonetic', rec.phonetic);
    fillIfEmpty('examples', rec.examples);
    fillIfEmpty('collocations', rec.collocations);
    fillIfEmpty('audioUrl', rec.audioUrl);
    fillIfEmpty('translations', rec.translations);
    fillIfEmpty('freqRank', rec.freqRank);
    fillIfEmpty('bnc', rec.bnc);
    fillIfEmpty('frq', rec.frq);
    return out;
  });

  await wordRepo.bulkUpsert(merged);

  return { wordbookId: seed.id, wordsLoaded: wordRecords.length };
}

export function makeWordId(word: string): string {
  return word.toLowerCase();
}
