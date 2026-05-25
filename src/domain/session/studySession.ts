import type { CardRecord } from '../../data/types';
import type { Grade } from '../types';
import { sm2 } from '../srs/sm2';

/**
 * 学习会话状态机（spec §6.2）。
 *
 * 状态：
 *   presenting → 显示词形、可发音；用户点"显示释义"
 *   revealed   → 完整释义/例句/音标显示；等用户选 0/1/2/3
 *   grading    → 应用 SM-2、写日志事件，自动转下一张
 *   done       → 队列空，会话结束
 *
 * 关键规则：
 * - 评分时若 grade<2，把当前卡回插队列末尾，本会话不重复写 reviewLogs（用 Set 标记）
 * - 状态机本身不写库；它只产出 reviewLogs/cardUpdate "事件"，由调用方落库
 */

export type SessionPhase = 'presenting' | 'revealed' | 'grading' | 'done';

export interface ReviewEvent {
  cardId: string;
  reviewedAt: number;
  grade: Grade;
  prevInterval: number;
  nextInterval: number;
  durationMs: number;
  /** 评分后的 card 完整状态，调用方据此 upsert */
  nextCard: CardRecord;
  /** 是否第一次在本会话评分（false=回插后再次评分，应只更新 card 不写日志） */
  firstReviewInSession: boolean;
}

export class StudySession {
  private queue: CardRecord[];
  private reviewedThisSession = new Set<string>();
  /** 用一个累积 events 列表方便测试与 UI 收集 */
  readonly events: ReviewEvent[] = [];
  private _phase: SessionPhase;
  private currentStartedAt: number | null = null;

  constructor(initialQueue: CardRecord[]) {
    this.queue = [...initialQueue];
    this._phase = this.queue.length === 0 ? 'done' : 'presenting';
  }

  get phase(): SessionPhase {
    return this._phase;
  }

  /** 当前正在出示的卡；done 时为 null */
  get current(): CardRecord | null {
    return this.queue[0] ?? null;
  }

  /** 队列剩余张数（含当前） */
  get remaining(): number {
    return this.queue.length;
  }

  /** 用户点"显示释义" */
  reveal(now: number): void {
    if (this._phase !== 'presenting') return;
    this._phase = 'revealed';
    this.currentStartedAt = now;
  }

  /**
   * 用户给出评分，状态机推进到下一张。
   * 返回当次产生的 ReviewEvent（done 时返回 null，不应被调用）。
   */
  grade(grade: Grade, now: number): ReviewEvent | null {
    if (this._phase !== 'revealed' || this.queue.length === 0) return null;

    const card = this.queue[0];
    const result = sm2(card, grade, now);
    const nextCard: CardRecord = {
      ...card,
      ease: result.ease,
      interval: result.interval,
      repetitions: result.repetitions,
      dueAt: result.dueAt,
      state: result.state,
      lastReviewedAt: now,
    };

    const firstReviewInSession = !this.reviewedThisSession.has(card.id);
    this.reviewedThisSession.add(card.id);

    const event: ReviewEvent = {
      cardId: card.id,
      reviewedAt: now,
      grade,
      prevInterval: card.interval,
      nextInterval: result.interval,
      durationMs: this.currentStartedAt !== null ? Math.max(0, now - this.currentStartedAt) : 0,
      nextCard,
      firstReviewInSession,
    };
    this.events.push(event);

    // 推进队列
    this.queue.shift();
    if (grade < 2) {
      // 失败：回插队列末尾（用更新后的 card，下次仍会从 presenting 开始）
      this.queue.push(nextCard);
    }

    this.currentStartedAt = null;
    this._phase = this.queue.length === 0 ? 'done' : 'presenting';
    return event;
  }

  /** 提供一个测试/UI 友好的快照 */
  snapshot() {
    return {
      phase: this._phase,
      remaining: this.remaining,
      currentId: this.current?.id ?? null,
      eventsCount: this.events.length,
    };
  }
}
