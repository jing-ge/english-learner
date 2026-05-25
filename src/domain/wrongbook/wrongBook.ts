import type { ReviewLogRecord } from '../../data/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 从最近窗口的 reviewLogs 派生"错词卡片 ID"。
 * 规则：以 cardId 为单位取**最后一次**评分；若最后一次 grade <= 1，视为错词。
 *
 * 这样能正确处理"上次错→今天对"的恢复情形，避免学过的词永远被钉在错词本。
 */
export function deriveWrongCardIds(
  logs: ReviewLogRecord[],
  windowDays = 14,
  now: number = Date.now(),
): string[] {
  const since = now - windowDays * DAY_MS;
  const last = new Map<string, ReviewLogRecord>();
  for (const l of logs) {
    if (l.reviewedAt < since) continue;
    const prev = last.get(l.cardId);
    if (!prev || l.reviewedAt > prev.reviewedAt) {
      last.set(l.cardId, l);
    }
  }
  const out: string[] = [];
  for (const [cardId, l] of last) {
    if (l.grade <= 1) out.push(cardId);
  }
  return out;
}

/**
 * 给定 logs 与窗口，按 cardId 汇总"最近 N 次评分中的错次数"，便于排序展示。
 */
export interface WrongStat {
  cardId: string;
  wrongCount: number;
  totalCount: number;
  lastReviewedAt: number;
  lastGrade: 0 | 1 | 2 | 3;
}

export function summarizeWrong(
  logs: ReviewLogRecord[],
  windowDays = 14,
  now: number = Date.now(),
): WrongStat[] {
  const since = now - windowDays * DAY_MS;
  const stats = new Map<string, WrongStat>();
  for (const l of logs) {
    if (l.reviewedAt < since) continue;
    let s = stats.get(l.cardId);
    if (!s) {
      s = { cardId: l.cardId, wrongCount: 0, totalCount: 0, lastReviewedAt: 0, lastGrade: l.grade };
      stats.set(l.cardId, s);
    }
    s.totalCount += 1;
    if (l.grade <= 1) s.wrongCount += 1;
    if (l.reviewedAt > s.lastReviewedAt) {
      s.lastReviewedAt = l.reviewedAt;
      s.lastGrade = l.grade;
    }
  }
  // 仅保留"最近一次评分 <=1"的，作为错词
  const out: WrongStat[] = [];
  for (const s of stats.values()) {
    if (s.lastGrade <= 1) out.push(s);
  }
  // 默认排序：错次最多在前，并列按最近反馈时间近的在前
  out.sort((a, b) => {
    if (a.wrongCount !== b.wrongCount) return b.wrongCount - a.wrongCount;
    return b.lastReviewedAt - a.lastReviewedAt;
  });
  return out;
}
