import { describe, it, expect } from 'vitest';
import { parseTagBadges, freqBucket } from './wordMeta';

describe('parseTagBadges', () => {
  it('解析空格分隔标签并按学习阶梯排序', () => {
    const out = parseTagBadges('ielts cet4 zk gre');
    expect(out.map((b) => b.code)).toEqual(['zk', 'cet4', 'ielts', 'gre']);
    expect(out.map((b) => b.label)).toEqual(['中考', '四级', '雅思', 'GRE']);
  });

  it('忽略未知标签', () => {
    const out = parseTagBadges('cet4 weirdtag toefl');
    expect(out.map((b) => b.code)).toEqual(['cet4', 'toefl']);
  });

  it('空/null/undefined 返回空数组', () => {
    expect(parseTagBadges(null)).toEqual([]);
    expect(parseTagBadges(undefined)).toEqual([]);
    expect(parseTagBadges('')).toEqual([]);
    expect(parseTagBadges('   ')).toEqual([]);
  });

  it('重复标签去重', () => {
    const out = parseTagBadges('cet4 cet4 ky cet4');
    expect(out.map((b) => b.code)).toEqual(['cet4', 'ky']);
  });

  it('大小写不敏感', () => {
    const out = parseTagBadges('CET4 Ielts');
    expect(out.map((b) => b.code)).toEqual(['cet4', 'ielts']);
  });
});

describe('freqBucket', () => {
  it('< 3000 高频', () => {
    expect(freqBucket(124, 201)?.level).toBe('high');
    expect(freqBucket(2057, undefined)?.level).toBe('high');
  });

  it('3000-10000 中频', () => {
    expect(freqBucket(5000, undefined)?.level).toBe('mid');
    expect(freqBucket(9999, 9999)?.level).toBe('mid');
  });

  it('>= 10000 低频', () => {
    expect(freqBucket(15000, 20000)?.level).toBe('low');
  });

  it('优先取较小（更高频）', () => {
    // bnc 中频但 frq 高频，应取高频
    expect(freqBucket(8000, 1000)?.level).toBe('high');
  });

  it('两个都没/为 0 返回 null', () => {
    expect(freqBucket(null, null)).toBeNull();
    expect(freqBucket(undefined, undefined)).toBeNull();
    expect(freqBucket(0, 0)).toBeNull();
  });

  it('一边缺失另一边可用', () => {
    expect(freqBucket(null, 500)?.level).toBe('high');
    expect(freqBucket(500, null)?.level).toBe('high');
  });
});
