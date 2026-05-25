/**
 * 解析用户粘贴/上传的文本，输出可入库的 word draft 列表。
 *
 * 支持两种格式（自动判断）：
 *
 * 1) 纯单词列表（每行一个词，无逗号）：
 *      abandon
 *      ability
 *
 *    无释义；后续靠 dictionary API 在线补全。
 *
 * 2) CSV 风格（每行：word,translation[,phonetic]）：
 *      abandon,放弃,/əˈbændən/
 *      ability,n. 能力
 *
 *    第二列若以词性前缀（n./v./adj. 等）开头，会拆到 translations[0].pos。
 *
 * 注意：解析层不去重、不做 ID 生成；调用方根据 wordbookId 派生 id。
 */

export interface WordDraft {
  word: string;
  pos?: string;
  meaning?: string;
  phonetic?: string;
}

export interface ParseResult {
  drafts: WordDraft[];
  invalidLines: string[];
}

const POS_RE = /^([a-z]+\.|[a-z]+\.\&\s*[a-z]+\.)\s*/i;

export function parseImportText(text: string): ParseResult {
  const drafts: WordDraft[] = [];
  const invalidLines: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(',').map((p) => p.trim());
    const word = parts[0];
    if (!isValidWord(word)) {
      invalidLines.push(rawLine);
      continue;
    }
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const draft: WordDraft = { word: key };
    if (parts.length >= 2 && parts[1]) {
      const m = parts[1].match(POS_RE);
      if (m) {
        draft.pos = m[1];
        draft.meaning = parts[1].slice(m[0].length).trim() || undefined;
      } else {
        draft.meaning = parts[1];
      }
    }
    if (parts.length >= 3 && parts[2]) {
      draft.phonetic = parts[2];
    }
    drafts.push(draft);
  }
  return { drafts, invalidLines };
}

function isValidWord(s: string): boolean {
  // 只允许 ASCII 字母 / 连字符 / 撇号 / 空格（多词短语），1..40 字符
  if (!s) return false;
  if (s.length > 40) return false;
  return /^[A-Za-z][A-Za-z'\- ]*$/.test(s);
}
