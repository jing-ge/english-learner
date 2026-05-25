import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetDb, getDb } from '@/data/db';
import { playAudio, __setFetch, __clearCache } from './audioCache';

class FakeAudio {
  src = '';
  paused = true;
  play = vi.fn().mockResolvedValue(undefined);
}

beforeEach(async () => {
  await resetDb();
  await __clearCache();
  // 替换全局 Audio，让 audioCache 内部 new Audio() 拿到 fake
  // 注意：模块级 _audio 单例可能跨用例缓存，所以每次都重新设置
  (globalThis as unknown as { Audio: typeof Audio }).Audio = FakeAudio as unknown as typeof Audio;
  // URL.createObjectURL 在 happy-dom 下可能未实现，stub 之
  (globalThis as unknown as { URL: typeof URL }).URL.createObjectURL = vi.fn(() => 'blob:fake');
});

describe('playAudio', () => {
  it('未命中缓存：fetch + 写入 + 播放', async () => {
    const blob = new Blob(['fake-mp3'], { type: 'audio/mpeg' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob, { status: 200 }));
    __setFetch(fetchMock as unknown as typeof fetch);

    await playAudio('https://x/a.mp3', { text: 'apple' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const cached = await getDb().audioCache.get('https://x/a.mp3');
    expect(cached).toBeDefined();
    expect(cached?.url).toBe('https://x/a.mp3');
    expect(cached?.cachedAt).toBeGreaterThan(0);
  });

  it('已命中缓存：不再 fetch', async () => {
    const blob = new Blob(['cached'], { type: 'audio/mpeg' });
    await getDb().audioCache.put({ url: 'https://x/b.mp3', blob, cachedAt: Date.now() });
    const fetchMock = vi.fn();
    __setFetch(fetchMock as unknown as typeof fetch);

    await playAudio('https://x/b.mp3', { text: 'banana' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch 失败时静默 fallback，不抛错', async () => {
    __setFetch(vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch);
    await expect(playAudio('https://x/c.mp3', { text: 'cherry' })).resolves.toBeUndefined();
  });

  it('非 200 响应不写缓存', async () => {
    __setFetch(
      vi.fn().mockResolvedValue(new Response('', { status: 404 })) as unknown as typeof fetch,
    );
    await playAudio('https://x/d.mp3', { text: 'date' });
    const cached = await getDb().audioCache.get('https://x/d.mp3');
    expect(cached).toBeUndefined();
  });
});
