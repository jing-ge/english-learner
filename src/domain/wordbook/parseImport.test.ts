import { describe, it, expect } from 'vitest';
import { parseImportText } from './parseImport';

describe('parseImportText', () => {
  it('解析纯单词列表', () => {
    const text = 'abandon\nability\nabsolute\n';
    const r = parseImportText(text);
    expect(r.drafts.map((d) => d.word)).toEqual(['abandon', 'ability', 'absolute']);
    expect(r.invalidLines).toEqual([]);
  });

  it('解析 CSV：word,translation', () => {
    const text = 'abandon,放弃\nability,n. 能力';
    const r = parseImportText(text);
    expect(r.drafts[0]).toMatchObject({ word: 'abandon', meaning: '放弃' });
    expect(r.drafts[1]).toMatchObject({ word: 'ability', pos: 'n.', meaning: '能力' });
  });

  it('解析 CSV：word,translation,phonetic', () => {
    const text = 'abandon,放弃,/əˈbændən/';
    const r = parseImportText(text);
    expect(r.drafts[0]).toMatchObject({
      word: 'abandon',
      meaning: '放弃',
      phonetic: '/əˈbændən/',
    });
  });

  it('忽略空行与注释', () => {
    const text = '\n# 这是注释\nabandon\n\n';
    const r = parseImportText(text);
    expect(r.drafts.map((d) => d.word)).toEqual(['abandon']);
  });

  it('去重（大小写不敏感）', () => {
    const text = 'abandon\nAbandon\nABANDON';
    const r = parseImportText(text);
    expect(r.drafts.map((d) => d.word)).toEqual(['abandon']);
  });

  it('拒绝非法行（含数字或符号开头）', () => {
    const text = '123abc\n!@#\nabandon';
    const r = parseImportText(text);
    expect(r.drafts.map((d) => d.word)).toEqual(['abandon']);
    expect(r.invalidLines.length).toBe(2);
  });

  it('小写化 word', () => {
    const text = 'Abandon';
    const r = parseImportText(text);
    expect(r.drafts[0].word).toBe('abandon');
  });

  it('支持多词短语', () => {
    const text = "give up,放弃\nlook forward to,期待";
    const r = parseImportText(text);
    expect(r.drafts.map((d) => d.word)).toEqual(['give up', 'look forward to']);
  });
});
