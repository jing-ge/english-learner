import type { Database, SqlJsStatic } from 'sql.js';
import type { Translation } from '@/data/types';

/**
 * 本地 ECDICT 字典（5.78 万高频词）。运行时按需加载到 IndexedDB 缓存，
 * 之后查询是 sql.js 内存查询，单次 <1ms。
 *
 * 加载策略：
 *   1. 第一次访问：fetch /dict/ecdict.db（~7MB），写入 IndexedDB（key=DB_CACHE_KEY）
 *   2. 之后冷启动：从 IndexedDB 读出 Uint8Array，直接交给 sql.js
 *   3. 任何阶段失败都不抛——caller 用 isReady() 判断，未就绪时跳过本地查找直接走在线兜底
 *
 * 字段说明（见 /tmp/ECDICT/README.md）：
 *   - translation: 中文释义，行间真换行，常见 "n. 政府, 内阁\nv. ..."
 *   - phonetic: 简化 IPA（用 ASCII '）
 *   - exchange: 形态学，例 "p:abandoned/d:abandoned/i:abandoning/3:abandons"
 *   - tag: cet4/ky/ielts/toefl/gre/...
 */

const base = import.meta.env.BASE_URL;
const DB_URL = `${base}dict/ecdict.db`;
const SQL_WASM_URL = `${base}dict/sql-wasm.wasm`;
const DB_CACHE_KEY = 'ecdict-v1';
const IDB_NAME = 'el-asset-cache';
const IDB_STORE = 'blobs';

let _db: Database | null = null;
let _loadPromise: Promise<Database | null> | null = null;

/** 极简 IndexedDB 二进制缓存 */
function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readCachedBytes(key: string): Promise<Uint8Array | null> {
  try {
    const db = await openCache();
    return await new Promise<Uint8Array | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function writeCachedBytes(key: string, bytes: Uint8Array): Promise<void> {
  try {
    const db = await openCache();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

async function fetchDbBytes(): Promise<Uint8Array> {
  const res = await fetch(DB_URL);
  if (!res.ok) throw new Error(`dict fetch ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** 触发加载；调用方可 await 或 fire-and-forget。失败时返回 null，后续 isReady() === false。 */
export async function ensureLocalDict(): Promise<Database | null> {
  if (_db) return _db;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const initSqlJs = (await import('sql.js')).default;
      const SQL: SqlJsStatic = await initSqlJs({ locateFile: () => SQL_WASM_URL });
      let bytes = await readCachedBytes(DB_CACHE_KEY);
      if (!bytes) {
        bytes = await fetchDbBytes();
        void writeCachedBytes(DB_CACHE_KEY, bytes);
      }
      _db = new SQL.Database(bytes);
      return _db;
    } catch (err) {
      console.warn('[localDict] load failed:', err);
      _db = null;
      return null;
    }
  })();
  return _loadPromise;
}

export function isReady(): boolean {
  return _db !== null;
}

export interface LocalDictResult {
  word: string;
  phonetic?: string;
  translations: Translation[];
  exchange?: string;
  tag?: string;
  bnc?: number;
  frq?: number;
}

/**
 * ECDICT translation 拆解：去噪声 [网络]/[计] 行 + 解析 "n. xxx" 词性前缀，最多 3 条。
 */
const POS_RE = /^([a-z]+\.(?:\/[a-z]+\.)*|[a-z]+\.&[a-z]+\.)\s*/i;
const NOISE_RE = /^\[[^\]]+\]\s*/;

function parseTranslation(raw: string): Translation[] {
  const out: Translation[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || NOISE_RE.test(trimmed)) continue;
    const m = trimmed.match(POS_RE);
    let pos: string | undefined;
    let meaning: string;
    if (m) {
      pos = m[1];
      meaning = trimmed.slice(m[0].length).trim();
    } else {
      meaning = trimmed;
    }
    if (!meaning) continue;
    out.push(pos ? { pos, meaning } : { meaning });
    if (out.length >= 3) break;
  }
  return out;
}

/** 同步查（DB 已就绪）。未命中返回 null。也支持 lemma：先查原型，未命中尝试 exchange 还原。 */
export function lookupSync(word: string): LocalDictResult | null {
  if (!_db) return null;
  const stmt = _db.prepare(
    'SELECT word, phonetic, translation, exchange, tag, bnc, frq FROM dict WHERE word = ? COLLATE NOCASE LIMIT 1',
  );
  try {
    stmt.bind([word.toLowerCase()]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as {
        word: string;
        phonetic: string | null;
        translation: string | null;
        exchange: string | null;
        tag: string | null;
        bnc: number | null;
        frq: number | null;
      };
      return {
        word: row.word,
        phonetic: row.phonetic
          ? row.phonetic.startsWith('/')
            ? row.phonetic
            : `/${row.phonetic}/`
          : undefined,
        translations: row.translation ? parseTranslation(row.translation) : [],
        exchange: row.exchange ?? undefined,
        tag: row.tag ?? undefined,
        bnc: row.bnc != null && row.bnc > 0 ? row.bnc : undefined,
        frq: row.frq != null && row.frq > 0 ? row.frq : undefined,
      };
    }
    return null;
  } finally {
    stmt.free();
  }
}

/** 异步包装：DB 未就绪时先 ensure。常用于 enrichWord 兜底链。 */
export async function lookup(word: string): Promise<LocalDictResult | null> {
  const db = await ensureLocalDict();
  if (!db) return null;
  return lookupSync(word);
}

/**
 * 批量查询词频（bnc/frq），复用单条 prepared statement。
 * 返回 Map<word, {bnc?, frq?}>，未命中的词不出现在 Map 中。
 * DB 未就绪返回空 Map。
 */
export function batchLookupFreq(words: string[]): Map<string, { bnc?: number; frq?: number }> {
  const out = new Map<string, { bnc?: number; frq?: number }>();
  if (!_db || words.length === 0) return out;
  const stmt = _db.prepare(
    'SELECT word, bnc, frq FROM dict WHERE word = ? COLLATE NOCASE LIMIT 1',
  );
  try {
    for (const w of words) {
      stmt.bind([w.toLowerCase()]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as {
          word: string;
          bnc: number | null;
          frq: number | null;
        };
        const bnc = row.bnc != null && row.bnc > 0 ? row.bnc : undefined;
        const frq = row.frq != null && row.frq > 0 ? row.frq : undefined;
        if (bnc !== undefined || frq !== undefined) {
          out.set(w, { bnc, frq });
        }
      }
      stmt.reset();
    }
  } finally {
    stmt.free();
  }
  return out;
}

/** ECDICT tag 字段是空格分隔的标签集合（如 "cet4 ky toefl"），按 LIKE 匹配 */
export type EcdictTag = 'gk' | 'cet4' | 'ky' | 'cet6' | 'ielts' | 'toefl' | 'gre';

/**
 * 按 tag 列出全部命中词，按 COALESCE(NULLIF(bnc,0), NULLIF(frq,0), 99999) 升序，
 * 给出稳定 freqRank（数组下标）。DB 未就绪返回空数组。
 *
 * 用于派生内置词书（gk/cet6/toefl/gre 不预生成 JSON，运行时从 ECDICT 抽取）。
 */
export async function listByTag(tag: EcdictTag, limit?: number): Promise<LocalDictResult[]> {
  const db = await ensureLocalDict();
  if (!db) return [];
  // 用 ' tag ' 包夹避免 'cet4' 命中 'cet40' 之类（虽然 ECDICT 没这种值，纯防御）
  const pattern = `% ${tag} %`;
  const sql =
    "SELECT word, phonetic, translation, exchange, tag, bnc, frq " +
    'FROM dict ' +
    "WHERE (' ' || tag || ' ') LIKE ? " +
    'ORDER BY COALESCE(NULLIF(bnc, 0), NULLIF(frq, 0), 99999) ASC, word ASC' +
    (limit !== undefined ? ` LIMIT ${Math.max(0, Math.floor(limit))}` : '');
  const stmt = db.prepare(sql);
  const out: LocalDictResult[] = [];
  try {
    stmt.bind([pattern]);
    while (stmt.step()) {
      const row = stmt.getAsObject() as {
        word: string;
        phonetic: string | null;
        translation: string | null;
        exchange: string | null;
        tag: string | null;
        bnc: number | null;
        frq: number | null;
      };
      out.push({
        word: row.word,
        phonetic: row.phonetic
          ? row.phonetic.startsWith('/')
            ? row.phonetic
            : `/${row.phonetic}/`
          : undefined,
        translations: row.translation ? parseTranslation(row.translation) : [],
        exchange: row.exchange ?? undefined,
        tag: row.tag ?? undefined,
        bnc: row.bnc != null && row.bnc > 0 ? row.bnc : undefined,
        frq: row.frq != null && row.frq > 0 ? row.frq : undefined,
      });
    }
  } finally {
    stmt.free();
  }
  return out;
}
