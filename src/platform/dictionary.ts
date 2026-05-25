import type { Translation, Example } from '@/data/types';

const ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const MAX_RETRIES = 2;
const BACKOFF_MS = [1000, 2000];
const COOLDOWN_KEY = 'el-dict-cooldown-until';
const COOLDOWN_MS = 5 * 60 * 1000;

export interface DictResult {
  phonetic?: string;
  audioUrl?: string;
  translations?: Translation[];
  examples?: Example[];
}

export class DictionaryUnavailableError extends Error {}

/** 模块级 fetch 注入（测试用） */
let _fetch: typeof fetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || (() => {
  throw new Error('fetch not available');
}) as typeof fetch;

export function __setFetch(impl: typeof fetch): void {
  _fetch = impl;
}

function now(): number {
  return Date.now();
}

function getCooldownStore(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function isInCooldown(): boolean {
  const s = getCooldownStore();
  if (!s) return false;
  const until = Number(s.getItem(COOLDOWN_KEY) || 0);
  return until > now();
}

function setCooldown(): void {
  const s = getCooldownStore();
  if (!s) return;
  s.setItem(COOLDOWN_KEY, String(now() + COOLDOWN_MS));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 拉取一个词的释义/音频。空响应 / 网络错 / 5xx 走重试。
 * - 429 立刻冷却 5 分钟，本次抛 DictionaryUnavailableError
 * - 其他失败抛 DictionaryUnavailableError，调用方走兜底
 */
export async function fetchDictionary(word: string): Promise<DictResult | null> {
  if (isInCooldown()) {
    throw new DictionaryUnavailableError('cooldown');
  }
  const url = `${ENDPOINT}/${encodeURIComponent(word)}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await _fetch(url);
      if (res.status === 429) {
        setCooldown();
        throw new DictionaryUnavailableError('rate-limited');
      }
      if (res.status === 404) return null;
      if (res.status >= 500) throw new Error(`server ${res.status}`);
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data: unknown = await res.json();
      return parseDictionaryResponse(data);
    } catch (err) {
      lastError = err;
      if (err instanceof DictionaryUnavailableError) throw err;
      if (attempt < MAX_RETRIES) await delay(BACKOFF_MS[attempt]);
    }
  }
  throw new DictionaryUnavailableError(`failed: ${(lastError as Error)?.message ?? 'unknown'}`);
}

interface ApiPhonetic {
  text?: string;
  audio?: string;
}
interface ApiMeaning {
  partOfSpeech?: string;
  definitions?: { definition?: string; example?: string }[];
}
interface ApiEntry {
  phonetic?: string;
  phonetics?: ApiPhonetic[];
  meanings?: ApiMeaning[];
}

export function parseDictionaryResponse(raw: unknown): DictResult | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const entries = raw as ApiEntry[];
  const head = entries[0];

  // 取第一个非空 phonetic 文本
  const phonetic =
    head.phonetic ||
    head.phonetics?.find((p) => p.text)?.text ||
    undefined;

  // 取第一个 mp3 audio
  const audioUrl =
    entries.flatMap((e) => e.phonetics ?? []).find((p) => p.audio && p.audio.endsWith('.mp3'))
      ?.audio ?? undefined;

  // 注意：Free Dictionary 返回的是英文释义，不是中文翻译。
  // 我们只把它当作"备用英文释义"塞给 translations.meaning，UI 仍优先显示已有中文。
  const translations: Translation[] = [];
  const examples: Example[] = [];
  for (const m of head.meanings ?? []) {
    const def = m.definitions?.[0]?.definition;
    if (def) translations.push({ pos: m.partOfSpeech ? `${m.partOfSpeech}.` : undefined, meaning: def });
    if (translations.length >= 3) break;
  }
  // 例句：跨所有词性、所有定义里抓前 2 条带 example 的英文例句
  for (const m of entries.flatMap((e) => e.meanings ?? [])) {
    for (const d of m.definitions ?? []) {
      if (d.example) examples.push({ en: d.example });
      if (examples.length >= 2) break;
    }
    if (examples.length >= 2) break;
  }

  return {
    phonetic: phonetic || undefined,
    audioUrl,
    translations: translations.length ? translations : undefined,
    examples: examples.length ? examples : undefined,
  };
}

export const __testing__ = { COOLDOWN_KEY, COOLDOWN_MS, MAX_RETRIES, BACKOFF_MS };
