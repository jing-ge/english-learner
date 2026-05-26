import { describe, it, expect } from 'vitest';
import { StudySession } from './studySession';
import type { CardRecord } from '../../data/types';

const NOW = 1_700_000_000_000;
const FSRS_PARAMS = { desiredRetention: 0.9 };

function card(id: string, overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    id,
    wordId: id,
    wordbooks: ['cet4'],
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    dueAt: NOW,
    state: 'new',
    addedAt: NOW,
    ...overrides,
  };
}

describe('StudySession', () => {
  it('空队列直接 done', () => {
    const s = new StudySession([], FSRS_PARAMS);
    expect(s.phase).toBe('done');
    expect(s.current).toBeNull();
  });

  it('非空队列起始 presenting，current 是首张', () => {
    const s = new StudySession([card('a'), card('b')], FSRS_PARAMS);
    expect(s.phase).toBe('presenting');
    expect(s.current?.id).toBe('a');
    expect(s.remaining).toBe(2);
  });

  it('reveal 后 phase=revealed', () => {
    const s = new StudySession([card('a')], FSRS_PARAMS);
    s.reveal(NOW);
    expect(s.phase).toBe('revealed');
  });

  it('grading 之前调用 grade 无效（返回 null）', () => {
    const s = new StudySession([card('a')], FSRS_PARAMS);
    expect(s.grade(3, NOW)).toBeNull();
  });

  it('正常顺序：reveal → grade(3) 推进到下一张', () => {
    const s = new StudySession([card('a'), card('b')], FSRS_PARAMS);
    s.reveal(NOW);
    const e = s.grade(3, NOW + 1000);
    expect(e).not.toBeNull();
    expect(e!.cardId).toBe('a');
    expect(e!.firstReviewInSession).toBe(true);
    expect(e!.durationMs).toBe(1000);
    expect(s.phase).toBe('presenting');
    expect(s.current?.id).toBe('b');
  });

  it('grade<2 把卡回插队列末尾', () => {
    const s = new StudySession([card('a'), card('b')], FSRS_PARAMS);
    s.reveal(NOW);
    s.grade(0, NOW + 500); // a 失败
    expect(s.current?.id).toBe('b');
    // 队列剩 b, a
    expect(s.remaining).toBe(2);
    s.reveal(NOW + 1000);
    s.grade(3, NOW + 1500); // b 通过
    expect(s.current?.id).toBe('a'); // a 回到了
    expect(s.phase).toBe('presenting');
  });

  it('回插后再次评分 firstReviewInSession=false', () => {
    const s = new StudySession([card('a')], FSRS_PARAMS);
    s.reveal(NOW);
    s.grade(0, NOW + 500); // a 回插
    expect(s.current?.id).toBe('a');
    s.reveal(NOW + 1000);
    const e2 = s.grade(3, NOW + 1500);
    expect(e2!.firstReviewInSession).toBe(false);
  });

  it('全部清空进入 done', () => {
    const s = new StudySession([card('a'), card('b')], FSRS_PARAMS);
    s.reveal(NOW);
    s.grade(3, NOW);
    s.reveal(NOW);
    s.grade(3, NOW);
    expect(s.phase).toBe('done');
    expect(s.current).toBeNull();
    expect(s.remaining).toBe(0);
  });

  it('events 累积所有评分事件（含回插的二次评分）', () => {
    const s = new StudySession([card('a')], FSRS_PARAMS);
    s.reveal(NOW);
    s.grade(0, NOW); // 第一次
    s.reveal(NOW);
    s.grade(3, NOW); // 第二次（回插后）
    expect(s.events).toHaveLength(2);
    expect(s.events[0].firstReviewInSession).toBe(true);
    expect(s.events[1].firstReviewInSession).toBe(false);
  });

  it('grade 产出的 nextCard 应用了 FSRS 状态变化', () => {
    const s = new StudySession([card('a', { stability: 0, difficulty: 0, reps: 0 })], FSRS_PARAMS);
    s.reveal(NOW);
    const e = s.grade(3, NOW)!;
    expect(e.nextCard.reps).toBeGreaterThanOrEqual(1);
    expect(e.nextCard.scheduled_days).toBeGreaterThanOrEqual(1);
    expect(e.nextCard.state).toBe('review');
    expect(e.nextCard.lastReviewedAt).toBe(NOW);
  });
});
