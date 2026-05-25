import type { CardRecord } from '../../data/types';

export interface SchedulerSettings {
  dailyNewCount: number;
  dailyReviewCap: number;
  activeWordbookIds: string[];
}

export interface SchedulerInput {
  settings: SchedulerSettings;
  /** 已加载的全部 cards（领域层不查库；调用方负责装载） */
  allCards: CardRecord[];
  /** 词形→freqRank 的映射，用于排序 new 卡。缺失视为 +Infinity（最低优先） */
  freqRankByWord?: Map<string, number>;
  now: number;
}

/**
 * 构建一次学习会话的卡片队列：
 *   1. 取 state='review' 且 dueAt <= now → reviews（按 dueAt 升序，受 dailyReviewCap 截断）
 *   2. 取 state='learning' → learnings（不受 cap 限制；本来就是当天该过的）
 *   3. 取 state='new' → news（按 freqRank 升序），取前 dailyNewCount 张
 *   4. 交错混合：先到期复习 → 中间穿插学习中 → 末尾新词
 *
 * 仅过滤 activeWordbookIds 中的词书；其他词书的卡片忽略。
 */
export function buildTodaySession(input: SchedulerInput): CardRecord[] {
  const { settings, allCards, freqRankByWord, now } = input;
  const activeSet = new Set(settings.activeWordbookIds);

  const inActive = (c: CardRecord) => activeSet.size === 0 || activeSet.has(c.wordbookId);

  const reviews = allCards
    .filter((c) => inActive(c) && c.state === 'review' && c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, Math.max(0, settings.dailyReviewCap));

  const learnings = allCards
    .filter((c) => inActive(c) && c.state === 'learning')
    .sort((a, b) => a.dueAt - b.dueAt);

  const newsAll = allCards
    .filter((c) => inActive(c) && c.state === 'new')
    .sort((a, b) => {
      const ra = freqRankByWord?.get(a.wordId) ?? Number.POSITIVE_INFINITY;
      const rb = freqRankByWord?.get(b.wordId) ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.wordId.localeCompare(b.wordId);
    });
  const news = newsAll.slice(0, Math.max(0, settings.dailyNewCount));

  return interleave(reviews, learnings, news);
}

/**
 * 简单交错：reviews 主序，每若干张穿插一张 learning，最后追加 news。
 * 用 step = ceil(reviews/learnings) 决定 learning 的注入间隔。
 */
function interleave(reviews: CardRecord[], learnings: CardRecord[], news: CardRecord[]): CardRecord[] {
  if (learnings.length === 0) return [...reviews, ...news];
  if (reviews.length === 0) return [...learnings, ...news];

  const out: CardRecord[] = [];
  const step = Math.max(1, Math.ceil(reviews.length / (learnings.length + 1)));
  let li = 0;
  for (let i = 0; i < reviews.length; i++) {
    out.push(reviews[i]);
    if (li < learnings.length && (i + 1) % step === 0) {
      out.push(learnings[li++]);
    }
  }
  while (li < learnings.length) out.push(learnings[li++]);
  out.push(...news);
  return out;
}

export const __testing__ = { interleave };
