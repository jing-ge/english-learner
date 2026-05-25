/**
 * ECDICT 元数据展示层。
 *
 * 两个能力：
 *   1. parseTagBadges(tag)  把 ECDICT tag 字段（"zk gk cet4 cet6 ky ielts toefl gre"）
 *      解析为 UI 徽章数组，按学习阶梯顺序排列、去重
 *   2. freqBucket(bnc, frq) 把 BNC/COCA 词频排名映射成"高频/中频/低频"档位
 *
 * 设计取舍：
 *   - tag 顺序是按"学习阶段递进"而非字母序：中考→高考→四六级→考研→雅思托福→GRE
 *     让用户一眼看出这词对自己当前目标是否相关
 *   - 词频档位：取 bnc/frq 中靠前者（更小的排名 = 更高频），单一指标更直观；
 *     两者都缺时不展示
 */

const TAG_ORDER: Array<[code: string, label: string]> = [
  ['zk', '中考'],
  ['gk', '高考'],
  ['cet4', '四级'],
  ['cet6', '六级'],
  ['ky', '考研'],
  ['ielts', '雅思'],
  ['toefl', '托福'],
  ['gre', 'GRE'],
];

export interface TagBadge {
  code: string;
  label: string;
}

export function parseTagBadges(tag: string | null | undefined): TagBadge[] {
  if (!tag) return [];
  const seen = new Set(tag.toLowerCase().split(/\s+/).filter(Boolean));
  const out: TagBadge[] = [];
  for (const [code, label] of TAG_ORDER) {
    if (seen.has(code)) out.push({ code, label });
  }
  return out;
}

export type FreqLevel = 'high' | 'mid' | 'low';

export interface FreqBadge {
  level: FreqLevel;
  label: string;
}

/**
 * 词频分档：数值越小越高频。优先用 bnc（英式），缺则用 frq（COCA 美式）。
 *   < 3000   高频
 *   3000-10000 中频
 *   >= 10000 低频
 */
export function freqBucket(
  bnc: number | null | undefined,
  frq: number | null | undefined,
): FreqBadge | null {
  const rank = pickRank(bnc, frq);
  if (rank == null) return null;
  if (rank < 3000) return { level: 'high', label: '高频' };
  if (rank < 10000) return { level: 'mid', label: '中频' };
  return { level: 'low', label: '低频' };
}

function pickRank(
  bnc: number | null | undefined,
  frq: number | null | undefined,
): number | null {
  const a = bnc != null && bnc > 0 ? bnc : null;
  const b = frq != null && frq > 0 ? frq : null;
  if (a != null && b != null) return Math.min(a, b);
  return a ?? b;
}
