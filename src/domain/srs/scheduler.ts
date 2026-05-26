import type { CardRecord } from '../../data/types';

export interface SchedulerSettings {
  dailyNewCount: number;
  dailyReviewCap: number;
  activeWordbookIds: string[];
}

export interface SchedulerInput {
  settings: SchedulerSettings;
  /** 预分类好的三类卡（v2 起调用方按需查库装载，避免全量扫表） */
  reviews: CardRecord[];
  learnings: CardRecord[];
  news: CardRecord[];
  /** 词形→freqRank 的映射，用于排序 new 卡。缺失视为 +Infinity（最低优先） */
  freqRankByWord?: Map<string, number>;
  now: number;
}

/**
 * 构建一次学习会话的卡片队列（v2）：
 *   1. reviews：调用方已用 [state+dueAt] 范围查到期；这里仅按 dueAt 升序，受 dailyReviewCap 截断
 *   2. learnings：调用方已查 state='learning'；不受 cap，按 dueAt 升序
 *   3. news：调用方已查 state='new'；按 freqRank 升序，取前 dailyNewCount
 *   4. 交错混合：先到期复习 → 中间穿插学习中 → 末尾新词
 *
 * activeWordbookIds 由调用方在查库时已应用，scheduler 不再做词书过滤。
 */
export function buildTodaySession(input: SchedulerInput): CardRecord[] {
  const { settings, reviews: rawReviews, learnings: rawLearnings, news: rawNews, freqRankByWord, now } = input;

  const reviews = rawReviews
    .filter((c) => c.state === 'review' && c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, Math.max(0, settings.dailyReviewCap));

  const learnings = rawLearnings
    .filter((c) => c.state === 'learning')
    .sort((a, b) => a.dueAt - b.dueAt);

  const newsAll = rawNews
    .filter((c) => c.state === 'new')
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
