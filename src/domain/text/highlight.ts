/**
 * 把英文句子按目标词高亮，返回一组 token：{ text, hit }。
 * - 不依赖词形还原库，仅做"近似词形"匹配：把目标词缩到稳定词干，再在句子里匹配以该词干开头、长度差 ≤ 4 的 token。
 * - 大小写不敏感。
 * - 仅匹配整词（用边界），不会把 "abandon" 命中到 "abandonment" 之外的随机片段里。
 */

export interface HighlightToken {
  text: string;
  hit: boolean;
}

/** 取一个稳定的小写词干：去尾 ing / ed / es / s / e / y（最多去一次）。 */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  if (w.length > 3 && w.endsWith('e')) return w.slice(0, -1);
  if (w.length > 3 && w.endsWith('y')) return w.slice(0, -1);
  return w;
}

/**
 * 切分句子并标记命中目标词的 token。命中规则：
 *   targetStem 是 tokenStem 的前缀，且 token 长度与 target 差距 ≤ 4。
 */
export function highlightSentence(sentence: string, target: string): HighlightToken[] {
  const targetStem = stem(target);
  if (!targetStem) return [{ text: sentence, hit: false }];

  const tokens: HighlightToken[] = [];
  // 用正则把"词"和"非词"都切出来，保留原文标点/空格
  const re = /([A-Za-z']+)|([^A-Za-z']+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence)) !== null) {
    const word = m[1];
    if (word !== undefined) {
      const ts = stem(word);
      const lenDiff = Math.abs(word.length - target.length);
      const hit = ts.startsWith(targetStem) && lenDiff <= 4;
      tokens.push({ text: word, hit });
    } else {
      tokens.push({ text: m[2] ?? '', hit: false });
    }
  }
  return tokens;
}
