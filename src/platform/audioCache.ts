import { getDb } from '@/data/db';
import { speak } from './tts';

/** 模块级 fetch 注入（测试用） */
let _fetch: typeof fetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || (() => {
  throw new Error('fetch not available');
}) as typeof fetch;

export function __setFetch(impl: typeof fetch): void {
  _fetch = impl;
}

/**
 * 单例 Audio 元素：避免每次播放都新建 + 自动取消上一次播放。
 * SSR 安全：访问 window 时再创建。
 */
let _audio: HTMLAudioElement | null = null;
function getAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!_audio) _audio = new Audio();
  return _audio;
}

/**
 * 播放一段音频：
 *   1. audioCache 命中 → 直接播放 Blob
 *   2. 未命中 → fetch + 缓存 + 播放
 *   3. 失败 → 调用方提供 fallbackText，回退到 SpeechSynthesis
 *
 * 任何阶段失败都不抛错（发音是辅助功能，不应阻塞学习）。
 */
export async function playAudio(
  url: string,
  fallback: { text: string; accent?: 'us' | 'uk' },
): Promise<void> {
  const audio = getAudio();
  if (!audio) return;

  try {
    const cached = await getCachedBlob(url);
    if (cached) {
      const blobUrl = URL.createObjectURL(cached);
      audio.src = blobUrl;
      audio.onloadeddata = () => URL.revokeObjectURL(blobUrl);
      await audio.play();
      return;
    }

    const blob = await fetchAndCache(url);
    if (blob) {
      const blobUrl = URL.createObjectURL(blob);
      audio.src = blobUrl;
      audio.onloadeddata = () => URL.revokeObjectURL(blobUrl);
      await audio.play();
      return;
    }

    speak(fallback.text, fallback.accent);
  } catch {
    speak(fallback.text, fallback.accent);
  }
}

async function getCachedBlob(url: string): Promise<Blob | null> {
  try {
    const r = await getDb().audioCache.get(url);
    return r?.blob ?? null;
  } catch {
    return null;
  }
}

async function fetchAndCache(url: string): Promise<Blob | null> {
  try {
    const res = await _fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    try {
      await getDb().audioCache.put({ url, blob, cachedAt: Date.now() });
    } catch {
      // 容量满等问题不影响播放
    }
    return blob;
  } catch {
    return null;
  }
}

/** 测试钩子：清缓存（避免 IndexedDB 跨用例残留） */
export async function __clearCache(): Promise<void> {
  try {
    await getDb().audioCache.clear();
  } catch {
    /* ignore */
  }
}
