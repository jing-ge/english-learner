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
  const dueReviewCount = ref(0);
  const newCardsAvailable = ref(0);
  const reviewedToday = ref(0);
  const learnedNewToday = ref(0);
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

    const [dueReviews, newCount, todaysLogs] = await Promise.all([
      cardRepo.listDueReviews(now),
      cardRepo.countByState('new'),
      reviewLogRepo.listSince(dayStart),
    ]);

    dueReviewCount.value = dueReviews.length;
    newCardsAvailable.value = Math.min(newCount, settings.settings.dailyNewCount);
    reviewedToday.value = todaysLogs.length;
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
