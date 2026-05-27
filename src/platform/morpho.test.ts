import { describe, it, expect } from 'vitest';
import { parseExchange, morphLabels, lookupRoots } from './morpho';

describe('parseExchange', () => {
  it('解析 abandon 的 exchange', () => {
    const m = parseExchange('p:abandoned/d:abandoned/i:abandoning/3:abandons');
    expect(m).toEqual({
      past: 'abandoned',
      pastParticiple: 'abandoned',
      presentParticiple: 'abandoning',
      thirdPerson: 'abandons',
    });
  });

  it('空/null 返回空对象', () => {
    expect(parseExchange(null)).toEqual({});
    expect(parseExchange('')).toEqual({});
    expect(parseExchange(undefined)).toEqual({});
  });

  it('解析比较级最高级', () => {
    expect(parseExchange('r:bigger/t:biggest')).toEqual({
      comparative: 'bigger',
      superlative: 'biggest',
    });
  });

  it('忽略未知/派生 key', () => {
    expect(parseExchange('1:s/0:cats/s:cats')).toEqual({
      lemma: 'cats',
      plural: 'cats',
    });
  });
});

describe('morphLabels', () => {
  it('p=d 时合并标签', () => {
    const labels = morphLabels({ past: 'abandoned', pastParticiple: 'abandoned' });
    expect(labels).toHaveLength(1);
    expect(labels[0]).toEqual({ label: '过去式 / 过去分词', value: 'abandoned' });
  });

  it('过滤空字段', () => {
    const labels = morphLabels({ past: 'ran' });
    expect(labels).toEqual([{ label: '过去式', value: 'ran' }]);
  });

  it('完整变形按固定顺序输出', () => {
    const labels = morphLabels({
      past: 'p',
      pastParticiple: 'd',
      presentParticiple: 'i',
      thirdPerson: '3',
    });
    expect(labels.map((l) => l.label)).toEqual([
      '过去式',
      '过去分词',
      '现在分词',
      '第三人称单数',
    ]);
  });
});

describe('lookupRoots', () => {
  it('未知词返回空数组', async () => {
    expect(await lookupRoots('xyzzy_not_a_word')).toEqual([]);
  });

  it('查到词根时返回结构化结果且 siblings 不含自己', async () => {
    const r = await lookupRoots('homicide');
    expect(r.length).toBeGreaterThan(0);
    const hom = r.find((x) => x.root === 'hom');
    expect(hom).toBeTruthy();
    expect(hom!.meaning).toContain('man');
    expect(hom!.siblings).not.toContain('homicide');
    expect(hom!.siblings.length).toBeGreaterThan(0);
  });

  it('大小写不敏感', async () => {
    const a = await lookupRoots('homicide');
    const b = await lookupRoots('Homicide');
    expect(a).toEqual(b);
  });
});
