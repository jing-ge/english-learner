import { wordbookRepo } from '../repositories/wordbookRepo';
import { getDb } from '../db';
import { loadSeedWordbook, type SeedWord } from './loader';
import { listByTag, batchLookupFreq, type EcdictTag } from '../../platform/localDict';

/**
 * 启动时确保内置词库已加载到 IndexedDB。
 *
 * 所有词书均从 ECDICT tag 派生，后台异步加载（首次需等 ECDICT ~7MB 加载完毕）。
 * derivedVersion 递增时触发重灌，确保老用户也能更新。
 * ECDICT 不可用时静默跳过，下次启动重试。
 */

interface DerivedSeedSpec {
  id: string;
  name: string;
  tag: EcdictTag;
  description: string;
  /** 版本号，递增触发重灌 */
  derivedVersion: number;
}

const DERIVED_BUILTINS: DerivedSeedSpec[] = [
  { id: 'gk', name: '高考核心', tag: 'gk', description: '高中范围核心词汇', derivedVersion: 2 },
  { id: 'cet4', name: 'CET-4 核心', tag: 'cet4', description: '四级核心词汇', derivedVersion: 2 },
  { id: 'ky', name: '考研核心', tag: 'ky', description: '考研大纲核心词汇', derivedVersion: 2 },
  { id: 'cet6', name: 'CET-6 核心', tag: 'cet6', description: '六级核心词汇', derivedVersion: 2 },
  { id: 'ielts', name: 'IELTS 核心', tag: 'ielts', description: '雅思核心词汇', derivedVersion: 2 },
  { id: 'toefl', name: 'TOEFL 核心', tag: 'toefl', description: '托福核心词汇', derivedVersion: 2 },
  { id: 'gre', name: 'GRE 核心', tag: 'gre', description: 'GRE 核心词汇', derivedVersion: 2 },
];

let _readyPromise: Promise<void> | null = null;
let _ready = false;

export async function ensureBuiltinSeeds(): Promise<void> {
  if (_readyPromise) return _readyPromise;
  _readyPromise = (async () => {
    try {
      const existing = await wordbookRepo.listBuiltin();
      const byId = new Map(existing.map((b) => [b.id, b as { id: string; source: string; seedVersion?: number }]));
      await loadDerivedAndEnrich(byId);
    } catch (err) {
      console.warn('[ensureBuiltinSeeds] failed, will retry next launch:', err);
    }
    _ready = true;
  })();
  return _readyPromise;
}

/** 等待词书就绪。如果还没开始加载，先触发加载。 */
export async function waitForSeeds(): Promise<void> {
  await ensureBuiltinSeeds();
}

/**
 * 后台加载 ECDICT 派生词书 + 批量词频富化。
 * ECDICT 首次加载约 7-8s（7MB），后续从 IndexedDB 缓存约 1-2s。
 * 导出供测试等待，生产环境由 ensureBuiltinSeeds 内部 fire-and-forget。
 */
export async function loadDerivedAndEnrich(byId: Map<string, { id: string; source: string; seedVersion?: number }>): Promise<void> {
  // 先尝试加载所有派生词书；只有 ky 加载成功后才执行 kaoyan→ky 迁移
  let kyLoaded = false;

  for (const spec of DERIVED_BUILTINS) {
    const cur = byId.get(spec.id);
    if (cur && (cur.seedVersion ?? 0) >= spec.derivedVersion) {
      if (spec.id === 'ky') kyLoaded = true;
      continue;
    }
    try {
      const rows = await listByTag(spec.tag);
      if (rows.length === 0) continue;
      const words: SeedWord[] = rows.map((r, i) => ({
        word: r.word,
        phonetic: r.phonetic,
        translations: r.translations,
        freqRank: i + 1,
      }));
      await loadSeedWordbook({
        id: spec.id,
        name: spec.name,
        description: spec.description,
        version: spec.derivedVersion,
        words,
      });
      if (spec.id === 'ky') kyLoaded = true;
    } catch (err) {
      console.warn(`[ensureBuiltinSeeds] derived ${spec.id} skipped:`, err);
    }
  }

  // ky 加载成功后才迁移旧 kaoyan（避免 ECDICT 不可用时删了旧词书又没新数据）
  if (kyLoaded) {
    try {
      await migrateSeedToDerived('kaoyan', 'ky', byId);
    } catch (err) {
      console.warn('[ensureBuiltinSeeds] migrate kaoyan→ky failed:', err);
    }
  }

  try {
    await enrichFreqFromEcdict();
  } catch (err) {
    console.warn('[ensureBuiltinSeeds] enrichFreq failed:', err);
  }
}

/**
 * 迁移旧 id 词书到新 id（如 'kaoyan' → 'ky'）。
 * words/cards/settings 中的旧 id 替换为新 id，删除旧词书记录。
 */
async function migrateSeedToDerived(
  oldId: string,
  newId: string,
  byId: Map<string, { id: string; source: string; seedVersion?: number }>,
): Promise<void> {
  if (!byId.has(oldId)) return;

  const db = getDb();
  await db.transaction('rw', db.words, db.wordbooks, db.cards, db.settings, async () => {
    // words: 批量替换 wordbooks 中的 oldId → newId
    const affected = await db.words.where('wordbooks').equals(oldId).toArray();
    if (affected.length > 0) {
      const updated = affected.map((w) => ({
        ...w,
        wordbooks: w.wordbooks.map((wb: string) => (wb === oldId ? newId : wb)),
      }));
      await db.words.bulkPut(updated);
    }

    // cards: 同上
    const affectedCards = await db.cards.where('wordbooks').equals(oldId).toArray();
    if (affectedCards.length > 0) {
      const updatedCards = affectedCards.map((c) => ({
        ...c,
        wordbooks: c.wordbooks.map((wb: string) => (wb === oldId ? newId : wb)),
      }));
      await db.cards.bulkPut(updatedCards);
    }

    // settings: activeWordbookIds 替换
    const s = await db.settings.get(1);
    if (s && Array.isArray(s.activeWordbookIds)) {
      s.activeWordbookIds = s.activeWordbookIds.map((id: string) => (id === oldId ? newId : id));
      await db.settings.put(s);
    }

    await db.wordbooks.delete(oldId);
  });

  byId.delete(oldId);
}

/**
 * 从 ECDICT 批量补充 words 表中缺失 bnc 的词条的词频数据。
 * 首次启动约数万条，用 bulkPut 一次性写入。
 */
async function enrichFreqFromEcdict(): Promise<void> {
  const db = getDb();
  const missing: { id: string; word: string }[] = [];
  await db.words.each((w) => {
    if (w.bnc === undefined || w.bnc === null) {
      missing.push({ id: w.id, word: w.word });
    }
  });
  if (missing.length === 0) return;

  const freqMap = batchLookupFreq(missing.map((m) => m.word));
  if (freqMap.size === 0) return;

  // 批量读出现有记录，内存中合并 bnc/frq，再 bulkPut
  const ids = missing.map((m) => m.id);
  const existing = await db.words.bulkGet(ids);
  const toPut = existing
    .filter((w): w is NonNullable<typeof w> => w !== undefined)
    .map((w) => {
      const f = freqMap.get(w.word);
      if (!f) return w;
      return {
        ...w,
        ...(f.bnc !== undefined && (w.bnc === undefined || w.bnc === null) ? { bnc: f.bnc } : {}),
        ...(f.frq !== undefined && (w.frq === undefined || w.frq === null) ? { frq: f.frq } : {}),
      };
    });

  await db.words.bulkPut(toPut);
}
