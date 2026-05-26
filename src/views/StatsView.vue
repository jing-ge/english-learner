<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { reviewLogRepo } from '@/data/repositories/reviewLogRepo';
import { cardRepo } from '@/data/repositories/cardRepo';
import { useSettingsStore } from '@/stores/settings';
import { computeStreak } from '@/domain/stats/streak';
import { bucketByDay, summarize, heatLevels, type DailyBucket } from '@/domain/stats/aggregate';
import {
  forecastDueByDay,
  forecastRetention,
  ebbinghausBaseline,
  type ForecastPoint,
  type RetentionPoint,
} from '@/domain/stats/forecast';
import { forgetting_curve, generatorParameters } from 'ts-fsrs';
import { deriveWrongCardIds } from '@/domain/wrongbook/wrongBook';
import { useAnimatedNumber } from '@/composables/useAnimatedNumber';

const DAY_MS = 24 * 60 * 60 * 1000;
const router = useRouter();
const settings = useSettingsStore();

const loading = ref(true);
const todayCount = ref(0);
const streak = ref(0);
const learnedCount = ref(0);
const newCount = ref(0);
const wrongCount = ref(0);

const heat = ref<DailyBucket[]>([]);
const heatLv = ref<number[]>([]);
const last7 = ref<DailyBucket[]>([]);

const FORECAST_DAYS = 30;
const dueForecast = ref<ForecastPoint[]>([]);
const myRetention = ref<RetentionPoint[]>([]);
const baseRetention = ref<RetentionPoint[]>([]);

const window7 = ref({ totalReviews: 0, totalCorrect: 0, accuracy: 0, activeDays: 0, totalDurationMs: 0 });
const window30 = ref({ totalReviews: 0, totalCorrect: 0, accuracy: 0, activeDays: 0, totalDurationMs: 0 });

// 记忆健康度分桶
const healthBuckets = ref({ solid: 0, warm: 0, fading: 0 });

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const max7 = computed(() => last7.value.reduce((m, b) => Math.max(m, b.reviews), 0));

function fmtMin(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}时${m}分`;
}

function dayShort(ts: number): string {
  const d = new Date(ts);
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
}

function dayNum(ts: number): number {
  return new Date(ts).getDate();
}

const todayStart = computed(() => startOfTodayMs());

onMounted(async () => {
  await settings.load();
  const dayStart = startOfTodayMs();
  const now = Date.now();
  const since = dayStart - 89 * DAY_MS; // 拉近 90 天，足够算热力图与各窗口
  const recentLogs = await reviewLogRepo.listSince(since);

  todayCount.value = recentLogs.filter((l) => l.reviewedAt >= dayStart).length;
  streak.value = computeStreak(recentLogs, now);
  wrongCount.value = deriveWrongCardIds(
    recentLogs,
    settings.settings.wrongWindowDays,
    now,
    settings.settings.wrongMaxGrade,
  ).length;

  const buckets30 = bucketByDay(recentLogs, 30, now);
  heat.value = buckets30;
  heatLv.value = heatLevels(buckets30);
  last7.value = bucketByDay(recentLogs, 7, now);

  window7.value = summarize(recentLogs, dayStart - 6 * DAY_MS, now);
  window30.value = summarize(recentLogs, dayStart - 29 * DAY_MS, now);

  // 仅统计当前活跃词书，与学习视图口径保持一致
  const activeIds = settings.settings.activeWordbookIds;
  const reviews = await cardRepo.listByStateAndWordbooks('review', activeIds);
  learnedCount.value = reviews.length;
  const news = await cardRepo.listByStateAndWordbooks('new', activeIds);
  newCount.value = news.length;

  // 记忆曲线：到期预报 + FSRS 留存率推演
  const learningCards = await cardRepo.listByStateAndWordbooks('learning', activeIds);
  const relearningCards = await cardRepo.listByStateAndWordbooks('relearning', activeIds);
  const allActiveCards = [...reviews, ...learningCards, ...relearningCards];
  const fsrsWeights = settings.settings.fsrsWeights;
  dueForecast.value = forecastDueByDay(allActiveCards, FORECAST_DAYS, now);
  myRetention.value = forecastRetention(allActiveCards, FORECAST_DAYS, now, fsrsWeights);
  baseRetention.value = ebbinghausBaseline(FORECAST_DAYS, fsrsWeights);

  // 记忆健康度：按 retrievability 分桶
  const w = fsrsWeights ?? generatorParameters().w;
  const DAY_MS2 = 86400000;
  let solid = 0, warm = 0, fading = 0;
  for (const c of allActiveCards) {
    if (!c.lastReviewedAt || c.stability <= 0) continue;
    const elapsed = Math.max(0, (now - c.lastReviewedAt) / DAY_MS2);
    const r = forgetting_curve(w, elapsed, c.stability);
    if (r >= 0.9) solid++;
    else if (r >= 0.7) warm++;
    else fading++;
  }
  healthBuckets.value = { solid, warm, fading };

  loading.value = false;
});

// SVG 图表布局参数
const CHART_W = 320;
const CHART_H = 140;
const CHART_PAD = { top: 12, right: 12, bottom: 22, left: 28 };

const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

const maxDue = computed(() =>
  Math.max(1, dueForecast.value.reduce((m, p) => Math.max(m, p.dueCount), 0)),
);

function dueBarX(i: number): number {
  if (dueForecast.value.length <= 1) return CHART_PAD.left;
  return CHART_PAD.left + (i / (dueForecast.value.length - 1)) * innerW;
}
function dueBarY(cnt: number): number {
  return CHART_PAD.top + innerH * (1 - cnt / maxDue.value);
}
function dueBarHeight(cnt: number): number {
  return innerH * (cnt / maxDue.value);
}

function retentionPath(points: RetentionPoint[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => {
      const x =
        CHART_PAD.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * innerW);
      const y = CHART_PAD.top + innerH * (1 - p.retention);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

const myRetentionPath = computed(() => retentionPath(myRetention.value));
const baseRetentionPath = computed(() => retentionPath(baseRetention.value));

const dueTickLabels = computed(() => {
  const ps = dueForecast.value;
  if (ps.length === 0) return [];
  const idxs = [0, Math.floor(ps.length / 3), Math.floor((ps.length * 2) / 3), ps.length - 1];
  return idxs.map((i) => ({
    x: dueBarX(i),
    label: i === 0 ? '今天' : `+${ps[i].dayOffset}天`,
  }));
});

const totalDueIn30 = computed(() =>
  dueForecast.value.reduce((s, p) => s + p.dueCount, 0),
);
const retentionAt30 = computed(() => {
  const last = myRetention.value[myRetention.value.length - 1];
  return last ? Math.round(last.retention * 100) : 0;
});

// 记忆健康度
const healthTotal = computed(() => healthBuckets.value.solid + healthBuckets.value.warm + healthBuckets.value.fading);
const healthSolidPct = computed(() => healthTotal.value === 0 ? 0 : Math.round(healthBuckets.value.solid / healthTotal.value * 100));
const healthWarmPct = computed(() => healthTotal.value === 0 ? 0 : Math.round(healthBuckets.value.warm / healthTotal.value * 100));
const healthFadingPct = computed(() => healthTotal.value === 0 ? 0 : 100 - healthSolidPct.value - healthWarmPct.value);

// KPI 数字滚动
const animatedStreak = useAnimatedNumber(streak, { duration: 700 });
const animatedTodayCount = useAnimatedNumber(todayCount, { duration: 600 });
const animatedLearnedCount = useAnimatedNumber(learnedCount, { duration: 800 });
const animatedNewCount = useAnimatedNumber(newCount, { duration: 600 });
const displayedStreak = computed(() => Math.round(animatedStreak.value));
const displayedTodayCount = computed(() => Math.round(animatedTodayCount.value));
const displayedLearnedCount = computed(() => Math.round(animatedLearnedCount.value));
const displayedNewCount = computed(() => Math.round(animatedNewCount.value));
</script>

<template>
  <div class="stats">
    <header class="page-hero">
      <div class="hero-title">学习统计</div>
      <div class="hero-sub">坚持比天赋更重要</div>
    </header>

    <section class="kpi-grid">
      <div class="kpi kpi-blue">
        <div class="kpi-num">{{ displayedStreak }}</div>
        <div class="kpi-label">连续打卡</div>
      </div>
      <div class="kpi kpi-green">
        <div class="kpi-num">{{ displayedTodayCount }}</div>
        <div class="kpi-label">今日复习</div>
      </div>
      <div class="kpi kpi-purple">
        <div class="kpi-num">{{ displayedLearnedCount }}</div>
        <div class="kpi-label">已学单词</div>
      </div>
      <div class="kpi kpi-orange">
        <div class="kpi-num">{{ displayedNewCount }}</div>
        <div class="kpi-label">待学新词</div>
      </div>
    </section>

    <!-- 记忆健康度 -->
    <section v-if="healthTotal > 0" class="block">
      <div class="block-head">
        <div class="block-title">记忆健康度</div>
        <div class="block-extra">{{ healthTotal }} 词已学</div>
      </div>
      <div class="health-bar">
        <div class="health-fill health-solid" :style="{ width: healthSolidPct + '%' }"></div>
        <div class="health-fill health-warm" :style="{ width: healthWarmPct + '%' }"></div>
        <div class="health-fill health-fading" :style="{ width: healthFadingPct + '%' }"></div>
      </div>
      <div class="health-legend">
        <span class="hl-item"><span class="hl-dot hl-solid"></span>牢固 {{ healthBuckets.solid }}<small>({{ healthSolidPct }}%)</small></span>
        <span class="hl-item"><span class="hl-dot hl-warm"></span>温习中 {{ healthBuckets.warm }}<small>({{ healthWarmPct }}%)</small></span>
        <span class="hl-item"><span class="hl-dot hl-fading"></span>将遗忘 {{ healthBuckets.fading }}<small>({{ healthFadingPct }}%)</small></span>
      </div>
    </section>

    <!-- 近 7 天复习趋势 -->
    <section class="block">
      <div class="block-head">
        <div class="block-title">近 7 天复习</div>
        <div class="block-extra">{{ window7.totalReviews }} 次 · 准确率 {{ Math.round(window7.accuracy * 100) }}%</div>
      </div>
      <div class="bars">
        <div
          v-for="(b, idx) in last7"
          :key="b.dayStart"
          class="bar-col"
        >
          <div class="bar-track">
            <div
              class="bar-fill"
              :class="{ 'bar-today': b.dayStart === todayStart }"
              :style="{ height: max7 === 0 ? '0%' : (b.reviews / max7 * 100) + '%' }"
            >
              <span v-if="b.reviews > 0" class="bar-num">{{ b.reviews }}</span>
            </div>
          </div>
          <div class="bar-label">{{ idx === last7.length - 1 ? '今' : dayShort(b.dayStart) }}</div>
        </div>
      </div>
    </section>

    <!-- 30 天热力图 -->
    <section class="block">
      <div class="block-head">
        <div class="block-title">最近 30 天</div>
        <div class="block-extra">{{ window30.activeDays }} 天 / 30 天 · {{ fmtMin(window30.totalDurationMs) }}</div>
      </div>
      <div class="heat-grid">
        <div
          v-for="(b, i) in heat"
          :key="b.dayStart"
          class="heat-cell"
          :class="`lv-${heatLv[i]}`"
          :title="`${new Date(b.dayStart).toLocaleDateString()} · ${b.reviews} 次`"
        >
          <span v-if="b.dayStart === todayStart" class="heat-today">{{ dayNum(b.dayStart) }}</span>
        </div>
      </div>
      <div class="heat-legend">
        <span class="legend-text">少</span>
        <span class="heat-cell lv-0"></span>
        <span class="heat-cell lv-1"></span>
        <span class="heat-cell lv-2"></span>
        <span class="heat-cell lv-3"></span>
        <span class="heat-cell lv-4"></span>
        <span class="legend-text">多</span>
      </div>
    </section>

    <!-- 错词本入口 -->
    <section class="block link-block" @click="router.push({ name: 'wrongbook' })">
      <div class="link-icon">📕</div>
      <div class="link-main">
        <div class="link-title">错词本</div>
        <div class="link-sub">最近 14 天没掌握的词，集中刷一遍</div>
      </div>
      <div class="link-side">
        <span class="link-num">{{ wrongCount }}</span>
        <span class="link-arrow">›</span>
      </div>
    </section>

    <!-- 未来 30 天到期复习量 -->
    <section class="block">
      <div class="block-head">
        <div class="block-title">未来 30 天到期</div>
        <div class="block-extra">共 {{ totalDueIn30 }} 张待复习</div>
      </div>
      <svg class="chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
        <line
          v-for="g in 4"
          :key="g"
          :x1="CHART_PAD.left"
          :x2="CHART_W - CHART_PAD.right"
          :y1="CHART_PAD.top + (innerH * g) / 4"
          :y2="CHART_PAD.top + (innerH * g) / 4"
          class="grid"
        />
        <rect
          v-for="(p, i) in dueForecast"
          :key="p.dayOffset"
          :x="dueBarX(i) - 3"
          :y="dueBarY(p.dueCount)"
          width="6"
          :height="dueBarHeight(p.dueCount)"
          :class="['due-bar', { 'due-bar-today': i === 0 }]"
          rx="1.5"
        />
        <text
          v-for="t in dueTickLabels"
          :key="t.x"
          :x="t.x"
          :y="CHART_H - 4"
          class="tick"
          text-anchor="middle"
        >{{ t.label }}</text>
        <text
          :x="CHART_PAD.left - 4"
          :y="CHART_PAD.top + 8"
          class="tick"
          text-anchor="end"
        >{{ maxDue }}</text>
        <text
          :x="CHART_PAD.left - 4"
          :y="CHART_PAD.top + innerH"
          class="tick"
          text-anchor="end"
        >0</text>
      </svg>
      <div class="chart-hint">每天到期复习的卡片数。逾期会归并到「今天」</div>
    </section>

    <!-- 遗忘曲线对比 -->
    <section class="block">
      <div class="block-head">
        <div class="block-title">记忆留存曲线</div>
        <div class="block-extra">{{ retentionAt30 }}% · 30 天后</div>
      </div>
      <svg class="chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" preserveAspectRatio="none">
        <line
          v-for="g in 4"
          :key="g"
          :x1="CHART_PAD.left"
          :x2="CHART_W - CHART_PAD.right"
          :y1="CHART_PAD.top + (innerH * g) / 4"
          :y2="CHART_PAD.top + (innerH * g) / 4"
          class="grid"
        />
        <path :d="baseRetentionPath" class="ret-base" fill="none" />
        <path :d="myRetentionPath" class="ret-mine" fill="none" />
        <text :x="CHART_PAD.left - 4" :y="CHART_PAD.top + 8" class="tick" text-anchor="end">100%</text>
        <text :x="CHART_PAD.left - 4" :y="CHART_PAD.top + innerH" class="tick" text-anchor="end">0%</text>
        <text :x="CHART_PAD.left" :y="CHART_H - 4" class="tick" text-anchor="start">今天</text>
        <text :x="CHART_W - CHART_PAD.right" :y="CHART_H - 4" class="tick" text-anchor="end">+30天</text>
      </svg>
      <div class="legend-row">
        <span class="legend-item"><span class="dot dot-mine"></span>按计划复习</span>
        <span class="legend-item"><span class="dot dot-base"></span>不复习（艾宾浩斯）</span>
      </div>
    </section>

    <!-- 30 天总览 -->
    <section class="block">
      <div class="block-head">
        <div class="block-title">30 天总览</div>
      </div>
      <div class="summary-grid">
        <div class="sum-cell">
          <div class="sum-num">{{ window30.totalReviews }}</div>
          <div class="sum-label">总复习次数</div>
        </div>
        <div class="sum-cell">
          <div class="sum-num">{{ Math.round(window30.accuracy * 100) }}%</div>
          <div class="sum-label">平均准确率</div>
        </div>
        <div class="sum-cell">
          <div class="sum-num">{{ fmtMin(window30.totalDurationMs) }}</div>
          <div class="sum-label">累计学习</div>
        </div>
        <div class="sum-cell">
          <div class="sum-num">{{ window30.activeDays }}</div>
          <div class="sum-label">学习天数</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats {
  min-height: 100vh;
  background: var(--el-bg-page);
  padding-bottom: var(--el-space-10);
}

/* hero */
.page-hero {
  background: var(--el-hero-grad);
  color: #fff;
  padding: calc(env(safe-area-inset-top) + var(--el-space-6)) var(--el-space-4) var(--el-space-8);
}
.hero-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.hero-sub {
  margin-top: 4px;
  font-size: 13px;
  opacity: 0.9;
}

/* KPI */
.kpi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--el-space-3);
  padding: 0 var(--el-space-4);
  margin-top: calc(var(--el-space-6) * -1);
  position: relative;
  z-index: 1;
}
.kpi {
  background: var(--el-bg-card);
  border-radius: var(--el-radius-lg);
  padding: var(--el-space-4) var(--el-space-4);
  box-shadow: var(--el-shadow-md);
  position: relative;
  overflow: hidden;
}
.kpi::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
}
.kpi-blue::before { background: linear-gradient(180deg, #6c8eff, #1677ff); }
.kpi-green::before { background: linear-gradient(180deg, #4ade80, #16a34a); }
.kpi-purple::before { background: linear-gradient(180deg, #a78bfa, #7c3aed); }
.kpi-orange::before { background: linear-gradient(180deg, #fbbf24, #f59e0b); }
.kpi-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.kpi-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-tertiary);
}

/* 卡片块 */
.block {
  margin: var(--el-space-5) var(--el-space-4) 0;
  background: var(--el-bg-card);
  border-radius: var(--el-radius-lg);
  box-shadow: var(--el-shadow-sm);
  padding: var(--el-space-4);
}
.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--el-space-4);
}
.block-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-primary);
}
.block-extra {
  font-size: 12px;
  color: var(--el-text-tertiary);
}

/* 7 天柱状图 */
.bars {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
  align-items: end;
  height: 130px;
}
.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  height: 100%;
}
.bar-track {
  flex: 1;
  width: 100%;
  background: var(--el-bg-soft);
  border-radius: 6px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  min-height: 6px;
}
.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #93c5fd, #1677ff);
  border-radius: 6px 6px 0 0;
  min-height: 4px;
  transition: height 0.5s ease;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 2px;
}
.bar-fill.bar-today {
  background: linear-gradient(180deg, #fbbf24, #ef4444);
}
.bar-num {
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  font-variant-numeric: tabular-nums;
}
.bar-label {
  font-size: 11px;
  color: var(--el-text-tertiary);
}

/* 热力图 6 列 x 5 行 = 30 格 */
.heat-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}
.heat-cell {
  aspect-ratio: 1;
  border-radius: 4px;
  background: var(--el-bg-soft);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.heat-cell.lv-0 { background: var(--el-bg-soft); }
.heat-cell.lv-1 { background: #c6e6ff; }
.heat-cell.lv-2 { background: #69b1ff; }
.heat-cell.lv-3 { background: #1677ff; }
.heat-cell.lv-4 { background: #003eb3; }
.heat-today {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.heat-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--el-space-3);
  justify-content: flex-end;
}
.heat-legend .heat-cell {
  width: 12px;
  height: 12px;
  aspect-ratio: unset;
}
.legend-text {
  font-size: 11px;
  color: var(--el-text-tertiary);
}

/* 总览四格 */
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--el-space-4);
}
.sum-cell {
  text-align: left;
}
.sum-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-primary);
  font-variant-numeric: tabular-nums;
}
.sum-label {
  font-size: 12px;
  color: var(--el-text-tertiary);
  margin-top: 2px;
}

/* 记忆健康度 */
.health-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--el-bg-soft);
}
.health-fill {
  height: 100%;
  transition: width 0.4s ease;
}
.health-solid { background: #16a34a; }
.health-warm { background: #f59e0b; }
.health-fading { background: #ef4444; }
.health-legend {
  display: flex;
  gap: var(--el-space-4);
  margin-top: var(--el-space-3);
  font-size: 12px;
  color: var(--el-text-secondary);
  flex-wrap: wrap;
}
.hl-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.hl-item small {
  color: var(--el-text-tertiary);
  margin-left: 2px;
}
.hl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.hl-solid { background: #16a34a; }
.hl-warm { background: #f59e0b; }
.hl-fading { background: #ef4444; }

/* 入口块 */
.link-block {
  display: flex;
  align-items: center;
  gap: var(--el-space-3);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.link-block:active {
  transform: scale(0.98);
}
.link-icon {
  font-size: 28px;
}
.link-main { flex: 1; min-width: 0; }
.link-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-primary);
}
.link-sub {
  font-size: 12px;
  color: var(--el-text-tertiary);
  margin-top: 2px;
}
.link-side {
  display: flex;
  align-items: center;
  gap: 4px;
}
.link-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--el-danger-500);
  font-variant-numeric: tabular-nums;
}
.link-arrow {
  color: var(--el-text-tertiary);
  font-size: 22px;
  line-height: 1;
}

/* 图表 */
.chart {
  width: 100%;
  height: 140px;
  display: block;
}
.chart .grid {
  stroke: var(--el-border-light);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}
.chart .tick {
  font-size: 10px;
  fill: var(--el-text-tertiary);
}
.due-bar {
  fill: var(--el-primary-300);
}
.due-bar-today {
  fill: var(--el-primary-500);
}
.ret-base {
  stroke: var(--el-text-tertiary);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  opacity: 0.6;
}
.ret-mine {
  stroke: var(--el-primary-500);
  stroke-width: 2.5;
}
.chart-hint {
  font-size: 12px;
  color: var(--el-text-tertiary);
  margin-top: var(--el-space-2);
}
.legend-row {
  display: flex;
  gap: var(--el-space-4);
  margin-top: var(--el-space-3);
  font-size: 12px;
  color: var(--el-text-secondary);
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 18px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
}
.dot-mine {
  background: var(--el-primary-500);
}
.dot-base {
  background: var(--el-text-tertiary);
  opacity: 0.6;
}
</style>
