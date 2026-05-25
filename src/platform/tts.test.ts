import { describe, it, expect } from 'vitest';
import { youdaoTtsUrl } from './tts';

describe('youdaoTtsUrl', () => {
  it('美音用 type=2', () => {
    const url = youdaoTtsUrl('apple', 'us');
    expect(url).toBe('https://dict.youdao.com/dictvoice?audio=apple&type=2');
  });

  it('英音用 type=1', () => {
    const url = youdaoTtsUrl('apple', 'uk');
    expect(url).toBe('https://dict.youdao.com/dictvoice?audio=apple&type=1');
  });

  it('默认美音', () => {
    const url = youdaoTtsUrl('hello');
    expect(url).toContain('type=2');
  });

  it('对短语做 URL 编码', () => {
    const url = youdaoTtsUrl('look forward to', 'us');
    expect(url).toContain('audio=look%20forward%20to');
  });

  it('特殊字符做 URL 编码', () => {
    const url = youdaoTtsUrl("it's", 'us');
    expect(url).toContain("audio=it's"); // 单引号在 encodeURIComponent 里保留
  });
});
