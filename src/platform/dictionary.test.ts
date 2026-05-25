import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchDictionary, parseDictionaryResponse, __setFetch, DictionaryUnavailableError, __testing__ } from './dictionary';

const { COOLDOWN_KEY } = __testing__;

function jsonRes(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('parseDictionaryResponse', () => {
  it('空数组/非数组返回 null', () => {
    expect(parseDictionaryResponse([])).toBeNull();
    expect(parseDictionaryResponse({})).toBeNull();
  });

  it('提取 phonetic / audio mp3 / 前 3 条 definition', () => {
    const raw = [
      {
        phonetic: '/həˈləʊ/',
        phonetics: [
          { text: '/həˈləʊ/', audio: 'https://x/hello.ogg' },
          { audio: 'https://x/hello.mp3' },
        ],
        meanings: [
          { partOfSpeech: 'noun', definitions: [{ definition: 'a greeting' }] },
          { partOfSpeech: 'verb', definitions: [{ definition: 'to greet' }] },
        ],
      },
    ];
    const r = parseDictionaryResponse(raw);
    expect(r?.phonetic).toBe('/həˈləʊ/');
    expect(r?.audioUrl).toBe('https://x/hello.mp3');
    expect(r?.translations).toHaveLength(2);
    expect(r?.translations?.[0]?.pos).toBe('noun.');
  });

  it('找不到 mp3 时 audioUrl 为 undefined', () => {
    const r = parseDictionaryResponse([
      { phonetics: [{ audio: 'https://x/a.ogg' }], meanings: [] },
    ]);
    expect(r?.audioUrl).toBeUndefined();
  });

  it('从 definitions[*].example 抽取前 2 条英文例句', () => {
    const raw = [
      {
        meanings: [
          {
            partOfSpeech: 'verb',
            definitions: [
              { definition: 'to do', example: 'I do it.' },
              { definition: 'to act', example: 'She acts well.' },
            ],
          },
          {
            partOfSpeech: 'noun',
            definitions: [{ definition: 'a thing', example: 'A thing here.' }],
          },
        ],
      },
    ];
    const r = parseDictionaryResponse(raw);
    expect(r?.examples).toEqual([{ en: 'I do it.' }, { en: 'She acts well.' }]);
  });

  it('没有 example 时 examples 为 undefined', () => {
    const r = parseDictionaryResponse([
      { meanings: [{ partOfSpeech: 'n', definitions: [{ definition: 'x' }] }] },
    ]);
    expect(r?.examples).toBeUndefined();
  });
});

describe('fetchDictionary', () => {
  it('200 + 合法响应直接返回', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonRes([
        { phonetic: '/h/', phonetics: [], meanings: [{ partOfSpeech: 'n', definitions: [{ definition: 'x' }] }] },
      ]),
    );
    __setFetch(fetchMock as unknown as typeof fetch);
    const r = await fetchDictionary('hello');
    expect(r?.phonetic).toBe('/h/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('404 返回 null（词典里没这个词）', async () => {
    __setFetch(vi.fn().mockResolvedValue(new Response('', { status: 404 })) as unknown as typeof fetch);
    const r = await fetchDictionary('zzzz');
    expect(r).toBeNull();
  });

  it('5xx 重试至上限后抛 DictionaryUnavailableError', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    __setFetch(fetchMock as unknown as typeof fetch);
    const p = fetchDictionary('hello');
    p.catch(() => {}); // 阻止 unhandled rejection
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeInstanceOf(DictionaryUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('429 立刻冷却 5 分钟', async () => {
    __setFetch(vi.fn().mockResolvedValue(new Response('', { status: 429 })) as unknown as typeof fetch);
    await expect(fetchDictionary('hi')).rejects.toBeInstanceOf(DictionaryUnavailableError);
    expect(Number(sessionStorage.getItem(COOLDOWN_KEY))).toBeGreaterThan(Date.now());
  });

  it('冷却中直接抛错，不发请求', async () => {
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + 60_000));
    const fetchMock = vi.fn();
    __setFetch(fetchMock as unknown as typeof fetch);
    await expect(fetchDictionary('hi')).rejects.toBeInstanceOf(DictionaryUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('网络异常重试 2 次后抛错', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));
    __setFetch(fetchMock as unknown as typeof fetch);
    const p = fetchDictionary('hi');
    p.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(p).rejects.toBeInstanceOf(DictionaryUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });
});
