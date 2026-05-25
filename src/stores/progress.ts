import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { cardRepo } from '../data/repositories/cardRepo';
import { reviewLogRepo } from '../data/repositories/reviewLogRepo';
import { useSettingsStore } from './settings';

/** 当天 0:00 时间戳（本地时区） */
function startOfTodayMs(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const useProgressStore = defineStore('progress', () => {
  const dueReviewCount = ref(0); // 今天到期且未学的复习数
  const newCardsAvailable = ref(0); // 还可纳入的新词数（按 dailyNewCount 上限）
  const reviewedToday = ref(0); // 今天已复习数（来自 reviewLogs）
  const learnedNewToday = ref(0); // 今天已学新词数（粗略：firstReviewInSession 的 reviewLogs 子集）
  const lastRefreshAt = ref(0);

  const todayNewProgress = computed(() => ({
    done: learnedNewToday.value,
    total: useSettingsStore().settings.dailyNewCount,
  }));

  const todayReviewProgress = computed(() => ({
    done: reviewedToday.value,
    total: dueReviewCount.value + reviewedToday.value,
  }));

  async function refresh(now: number = Date.now()): Promise<void> {
    const settings = useSettingsStore();
    if (!settings.loaded) await settings.load();

    const dayStart = startOfTodayMs(now);

    const [dueReviews, newCards, todaysLogs] = await Promise.all([
      cardRepo.listDueReviews(now),
      cardRepo.listByState('new'),
      reviewLogRepo.listSince(dayStart),
    ]);

    dueReviewCount.value = dueReviews.length;
    newCardsAvailable.value = Math.min(newCards.length, settings.settings.dailyNewCount);
    reviewedToday.value = todaysLogs.length;

    // "新词被学过"近似定义：今日 log 中 prevInterval=0 的记录数
    learnedNewToday.value = todaysLogs.filter((l) => l.prevInterval === 0).length;

    lastRefreshAt.value = now;
  }

  return {
    dueReviewCount,
    newCardsAvailable,
    reviewedToday,
    learnedNewToday,
    lastRefreshAt,
    todayNewProgress,
    todayReviewProgress,
    refresh,
  };
});
