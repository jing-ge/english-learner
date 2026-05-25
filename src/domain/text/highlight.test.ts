import { describe, it, expect } from 'vitest';
import { highlightSentence, stem } from './highlight';

describe('stem', () => {
  it('去 ing/ed/es/s/e/y 词尾', () => {
    expect(stem('abandoning')).toBe('abandon');
    expect(stem('abandoned')).toBe('abandon');
    expect(stem('abandons')).toBe('abandon');
    expect(stem('cars')).toBe('car');
    expect(stem('boxes')).toBe('box');
    expect(stem('abandon')).toBe('abandon');
  });
});

describe('highlightSentence', () => {
  it('命中目标词原型', () => {
    const r = highlightSentence("Don't abandon your dreams.", 'abandon');
    expect(r.find((t) => t.text.toLowerCase() === 'abandon')?.hit).toBe(true);
    expect(r.find((t) => t.text === 'dreams')?.hit).toBe(false);
  });

  it('命中目标词的 -ing / -ed / -s 变形', () => {
    const r1 = highlightSentence('She is abandoning the plan.', 'abandon');
    expect(r1.find((t) => t.text === 'abandoning')?.hit).toBe(true);
    const r2 = highlightSentence('They abandoned hope.', 'abandon');
    expect(r2.find((t) => t.text === 'abandoned')?.hit).toBe(true);
  });

  it('大小写不敏感', () => {
    const r = highlightSentence('Abandon ship!', 'abandon');
    expect(r.find((t) => t.text === 'Abandon')?.hit).toBe(true);
  });

  it('保留原文标点与空白', () => {
    const r = highlightSentence('Hello, world!', 'world');
    const recon = r.map((t) => t.text).join('');
    expect(recon).toBe('Hello, world!');
  });

  it('差距过大的同前缀词不被命中', () => {
    // abstract(8) vs abstractness(12) 差 4，仍命中（同根）；但 abstractionism(14) 差 6，不命中
    const r = highlightSentence('Abstractionism is a movement.', 'abstract');
    expect(r.find((t) => t.text === 'Abstractionism')?.hit).toBe(false);
  });
});
