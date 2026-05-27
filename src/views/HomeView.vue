<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProgressStore } from '@/stores/progress';
import { useSettingsStore } from '@/stores/settings';
import { waitForSeeds } from '@/data/seed';
import { reviewLogRepo } from '@/data/repositories/reviewLogRepo';
import { computeStreak } from '@/domain/stats/streak';
import { useAnimatedNumber } from '@/composables/useAnimatedNumber';

const router = useRouter();
const progress = useProgressStore();
const settings = useSettingsStore();

const streak = ref(0);
const loading = ref(true);

onMounted(async () => {
  // waitForSeeds 和 settings.load 无依赖，并行执行
  const [,] = await Promise.all([waitForSeeds(), settings.load()]);
  await progress.refresh();
  const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const recent = await reviewLogRepo.listSince(sixtyDaysAgo);
  streak.value = computeStreak(recent, Date.now());
  loading.value = false;
});

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '深夜好';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const hasActive = computed(() => settings.settings.activeWordbookIds.length > 0);

const newDone = computed(() => progress.todayNewProgress.done);
const newTotal = computed(() => progress.todayNewProgress.total);
const reviewDone = computed(() => progress.todayReviewProgress.done);
const reviewTotal = computed(() => progress.todayReviewProgress.total);

const newPct = computed(() =>
  newTotal.value === 0 ? 0 : Math.min(100, Math.round((newDone.value / newTotal.value) * 100)),
);
const reviewPct = computed(() =>
  reviewTotal.value === 0
    ? 0
    : Math.min(100, Math.round((reviewDone.value / reviewTotal.value) * 100)),
);

const todayPending = computed(
  () =>
    Math.max(0, newTotal.value - newDone.value) +
    Math.max(0, reviewTotal.value - reviewDone.value),
);

const allDone = computed(() => hasActive.value && todayPending.value === 0);

// 数字滚动：首屏从 0 缓动到目标值，刷新时短暂动画
const animatedStreak = useAnimatedNumber(streak, { duration: 700 });
const animatedNewDone = useAnimatedNumber(newDone, { duration: 500 });
const animatedReviewDone = useAnimatedNumber(reviewDone, { duration: 500 });
const displayedStreak = computed(() => Math.round(animatedStreak.value));
const displayedNewDone = computed(() => Math.round(animatedNewDone.value));
const displayedReviewDone = computed(() => Math.round(animatedReviewDone.value));

function start() {
  router.push({ name: 'study' });
}
function goWordbook() {
  router.push({ name: 'wordbook' });
}
function goLookup() {
  router.push({ name: 'lookup' });
}
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="hero-greeting">{{ greeting }}</div>
          <div class="hero-tagline">
            <template v-if="!hasActive">先选一本词书开始学习吧 👇</template>
            <template v-else-if="allDone">今天学习已完成，给自己点个赞 👏</template>
            <template v-else>今天还有 {{ todayPending }} 张卡待完成</template>
          </div>
        </div>
        <div class="streak-badge">
          <span class="streak-num">{{ displayedStreak }}</span>
          <span class="streak-label">天连续</span>
        </div>
      </div>
    </section>

    <!-- 空状态：未启用任何词书 -->
    <section v-if="!loading && !hasActive" class="onboarding">
      <div class="onb-icon">📚</div>
      <div class="onb-title">欢迎使用 English Learner</div>
      <div class="onb-sub">无广告、无订阅、可离线，专注帮你记牢每一个单词</div>
      <ul class="onb-list">
        <li><span class="check">✓</span>FSRS 算法智能调度复习</li>
        <li><span class="check">✓</span>例句关键词高亮、发音离线缓存</li>
        <li><span class="check">✓</span>30 天热力图见证你的努力</li>
      </ul>
      <button class="cta" @click="goWordbook">
        选择词书
        <span class="cta-sub">CET-4 · 考研 · 雅思 任选</span>
      </button>
      <button class="lookup-link" @click="goLookup">
        <van-icon name="search" size="16" />
        先查个词看看
      </button>
    </section>

    <!-- 正常态：进度卡 + 开始学习 -->
    <template v-else-if="!loading">
      <section class="progress-cards">
        <div class="pcard pcard-blue">
          <div class="pcard-head">
            <span class="pcard-title">今日新词</span>
            <span class="pcard-count">{{ displayedNewDone }}<i>/{{ newTotal }}</i></span>
          </div>
          <div class="bar">
            <div class="bar-fill bar-fill-blue" :style="{ width: newPct + '%' }"></div>
          </div>
        </div>

        <div class="pcard pcard-green">
          <div class="pcard-head">
            <span class="pcard-title">今日复习</span>
            <span class="pcard-count">{{ displayedReviewDone }}<i>/{{ reviewTotal }}</i></span>
          </div>
          <div class="bar">
            <div class="bar-fill bar-fill-green" :style="{ width: reviewPct + '%' }"></div>
          </div>
        </div>
      </section>

      <button class="cta" @click="start" :disabled="allDone">
        <template v-if="allDone">今日已完成 🎉</template>
        <template v-else>
          开始学习
          <span class="cta-sub">{{ todayPending }} 张待完成</span>
        </template>
      </button>

      <button class="lookup-link" @click="goLookup">
        <van-icon name="search" size="16" />
        查词
      </button>
    </template>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  background: var(--el-bg-page);
}

.hero {
  background: var(--el-hero-grad);
  color: #fff;
  padding: calc(env(safe-area-inset-top) + 24px) 20px 56px;
  border-bottom-left-radius: var(--el-radius-xl);
  border-bottom-right-radius: var(--el-radius-xl);
}
.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.hero-greeting {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.hero-tagline {
  margin-top: 6px;
  font-size: 14px;
  opacity: 0.9;
}
.streak-badge {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  border-radius: var(--el-radius-md);
  padding: 8px 14px;
  text-align: center;
}
.streak-num {
  display: block;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}
.streak-label {
  font-size: 11px;
  opacity: 0.85;
}

.onboarding {
  margin: -32px var(--el-space-4) 0;
  background: var(--el-bg-card);
  border-radius: var(--el-radius-lg);
  padding: var(--el-space-6) var(--el-space-5);
  box-shadow: var(--el-shadow-md);
  text-align: center;
}
.onb-icon {
  font-size: 44px;
  line-height: 1;
}
.onb-title {
  margin-top: var(--el-space-3);
  font-size: 18px;
  font-weight: 700;
  color: var(--el-text-primary);
}
.onb-sub {
  margin-top: var(--el-space-2);
  font-size: 13px;
  color: var(--el-text-tertiary);
  line-height: 1.5;
}
.onb-list {
  list-style: none;
  padding: 0;
  margin: var(--el-space-5) 0 var(--el-space-5);
  text-align: left;
  display: grid;
  gap: 10px;
}
.onb-list li {
  font-size: 14px;
  color: var(--el-text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--el-primary-50);
  color: var(--el-primary-500);
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}
.onboarding .cta {
  margin: 0 auto;
  width: 100%;
}

.progress-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--el-space-3);
  margin: -32px var(--el-space-4) 0;
}
.pcard {
  background: var(--el-bg-card);
  border-radius: var(--el-radius-lg);
  padding: var(--el-space-4);
  box-shadow: var(--el-shadow-md);
}
.pcard-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--el-space-3);
}
.pcard-title {
  font-size: var(--el-font-sm);
  color: var(--el-text-secondary);
}
.pcard-count {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-primary);
}
.pcard-count i {
  font-style: normal;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-tertiary);
  margin-left: 2px;
}
.bar {
  height: 6px;
  background: var(--el-bg-soft);
  border-radius: 3px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.bar-fill-blue {
  background: linear-gradient(90deg, #6c8eff, #1677ff);
}
.bar-fill-green {
  background: linear-gradient(90deg, #4ade80, #16a34a);
}

.cta {
  display: block;
  width: calc(100% - 32px);
  margin: var(--el-space-6) auto 0;
  background: var(--el-hero-grad);
  color: #fff;
  border: none;
  border-radius: var(--el-radius-lg);
  padding: 18px 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  box-shadow: var(--el-shadow-cta);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.cta:active {
  transform: scale(0.98);
  box-shadow: 0 4px 12px rgba(22, 119, 255, 0.24);
}
.cta:disabled {
  background: var(--el-bg-soft);
  color: var(--el-text-tertiary);
  box-shadow: none;
  cursor: default;
}
.cta-sub {
  display: block;
  font-size: 12px;
  opacity: 0.85;
  font-weight: 400;
  letter-spacing: 0;
  margin-top: 4px;
}
.lookup-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: var(--el-space-4);
  background: transparent;
  border: 1px solid var(--el-primary-300);
  color: var(--el-primary-500);
  border-radius: var(--el-radius-md);
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.lookup-link:active {
  background: var(--el-primary-50);
}
</style>
