/**
 * 学习提醒（前台 / PWA 内）。
 *
 * 工作原理：
 * - 注册一个每分钟检查的轻量定时器
 * - 当当前时间 hh:mm 命中 reminderTime，且今天没提醒过、且今天没学习过 → 触发 Notification
 * - "提醒过"用 localStorage 记录当天日期，避免每分钟重复触发
 *
 * 限制：浏览器关闭/PWA 未运行时不会触发——这是 Web 推送的固有限制；
 * 真正的离线提醒需要 push server，超出本地 PWA 范畴。
 */

import { reviewLogRepo } from '../data/repositories/reviewLogRepo';

const LS_KEY = 'el.lastReminderDate';
const TICK_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let currentTime: string | null = null;

export function startReminder(reminderTime: string | undefined): void {
  stopReminder();
  if (!reminderTime || !/^\d{2}:\d{2}$/.test(reminderTime)) return;
  currentTime = reminderTime;
  // 立刻检查一次（启动后若已过时间，今天还未学习也提醒）
  void check();
  timer = setInterval(() => void check(), TICK_MS);
}

export function stopReminder(): void {
  if (timer) clearInterval(timer);
  timer = null;
  currentTime = null;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

function todayKey(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function startOfTodayMs(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function check(): Promise<void> {
  if (!currentTime) return;
  if (!isNotificationSupported() || Notification.permission !== 'granted') return;

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hhmm < currentTime) return; // 还没到时间
  const day = todayKey(now.getTime());
  if (localStorage.getItem(LS_KEY) === day) return; // 今天已提醒过

  // 今天已经学过则跳过
  const reviewed = await reviewLogRepo.countSince(startOfTodayMs(now.getTime()));
  if (reviewed > 0) {
    localStorage.setItem(LS_KEY, day); // 标记免再触发
    return;
  }

  try {
    new Notification('该背单词啦 📚', {
      body: '保持连续打卡，今天的学习还没开始',
      tag: 'el-daily-reminder',
    });
    localStorage.setItem(LS_KEY, day);
  } catch {
    // ignore
  }
}
