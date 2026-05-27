/**
 * 形态学 / 词根联想模块。
 *
 * 两个能力：
 *   1. parseExchange(s)  解析 ECDICT 的 exchange 字段（如 "p:abandoned/d:abandoned/i:abandoning/3:abandons"）
 *      → 返回结构化的形态变化（过去式/进行式/复数 等），用于词卡背面展示
 *   2. lookupRoots(word) 查 wordroots.json，返回该词所属的词根 + 同根词
 *
 * exchange 字段编码（来自 ECDICT/README）：
 *   p: 过去式  past tense
 *   d: 过去分词  past participle
 *   i: 现在分词  present participle
 *   3: 第三人称单数
 *   r: 比较级  comparative
 *   t: 最高级  superlative
 *   s: 复数
 *   0: 原型  lemma
 *   1: 原型的派生原因 (s/p/i/3/r/t/d/...)
 */

export type ExchangeKey = 'p' | 'd' | 'i' | '3' | 'r' | 't' | 's' | '0' | '1';

export interface MorphForms {
  past?: string;        // p
  pastParticiple?: string; // d
  presentParticiple?: string; // i
  thirdPerson?: string; // 3
  comparative?: string; // r
  superlative?: string; // t
  plural?: string;      // s
  lemma?: string;       // 0  (此 word 是某个原型的形态变化)
}

export function parseExchange(raw: string | null | undefined): MorphForms {
  const out: MorphForms = {};
  if (!raw) return out;
  for (const part of raw.split('/')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim() as ExchangeKey;
    const val = part.slice(idx + 1).trim();
    if (!val) continue;
    switch (key) {
      case 'p': out.past = val; break;
      case 'd': out.pastParticiple = val; break;
      case 'i': out.presentParticiple = val; break;
      case '3': out.thirdPerson = val; break;
      case 'r': out.comparative = val; break;
      case 't': out.superlative = val; break;
      case 's': out.plural = val; break;
      case '0': out.lemma = val; break;
      // '1' 派生类型不展示
    }
  }
  return out;
}

/** 把 MorphForms 拍平为 [{label, value}] 用于 UI 渲染，去掉空值，重复值（如 past=pastParticiple）合并 */
export function morphLabels(m: MorphForms): { label: string; value: string }[] {
  const order: [keyof MorphForms, string][] = [
    ['past', '过去式'],
    ['pastParticiple', '过去分词'],
    ['presentParticiple', '现在分词'],
    ['thirdPerson', '第三人称单数'],
    ['plural', '复数'],
    ['comparative', '比较级'],
    ['superlative', '最高级'],
    ['lemma', '原型'],
  ];
  // 同值合并（avoided 同时是 p 和 d 时只展示一次「过去式 / 过去分词」）
  const valueToLabels = new Map<string, string[]>();
  for (const [key, label] of order) {
    const v = m[key];
    if (!v) continue;
    const list = valueToLabels.get(v);
    if (list) list.push(label);
    else valueToLabels.set(v, [label]);
  }
  return Array.from(valueToLabels.entries()).map(([value, labels]) => ({
    label: labels.join(' / '),
    value,
  }));
}

// ---------- 词根 ----------

interface RootInfo {
  meaning: string;
  class: string;
  origin?: string | null;
  examples: string[];
}

interface WordRootDb {
  roots: Record<string, RootInfo>;
  wordToRoots: Record<string, string[]>;
}

let dbCache: WordRootDb | null = null;

async function loadDb(): Promise<WordRootDb> {
  if (dbCache) return dbCache;
  const mod = await import('@/data/seed/wordroots.json');
  dbCache = mod.default as unknown as WordRootDb;
  return dbCache;
}

export interface RootLookupResult {
  root: string;
  meaning: string;
  origin?: string;
  /** 同根词（不含查询词本身），最多 8 个 */
  siblings: string[];
}

/**
 * 查一个词的词根列表。同一个词可能挂多个词根（如前缀 + 词根 + 后缀）。
 * 返回的 siblings 是同根词中**去掉自己**后的前 8 个。
 */
export async function lookupRoots(word: string): Promise<RootLookupResult[]> {
  const db = await loadDb();
  const wl = word.toLowerCase();
  const rootIds = db.wordToRoots[wl];
  if (!rootIds || rootIds.length === 0) return [];
  const out: RootLookupResult[] = [];
  for (const rid of rootIds) {
    const info = db.roots[rid];
    if (!info) continue;
    const siblings = info.examples
      .filter((w) => w.toLowerCase() !== wl)
      .slice(0, 8);
    out.push({
      root: rid,
      meaning: info.meaning,
      origin: info.origin ?? undefined,
      siblings,
    });
  }
  return out;
}
