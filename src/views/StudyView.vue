<script setup lang="ts">
import { ref, computed, onMounted, shallowRef, triggerRef } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { NavBar, Loading } from 'vant';
import { waitForSeeds } from '@/data/seed';
import WordCard from '@/components/WordCard.vue';
import AnswerBar from '@/components/AnswerBar.vue';
import { buildTodaySession } from '@/domain/srs/scheduler';
import { StudySession, type ReviewEvent } from '@/domain/session/studySession';
import { cardRepo } from '@/data/repositories/cardRepo';
import { wordRepo } from '@/data/repositories/wordRepo';
import { reviewLogRepo } from '@/data/repositories/reviewLogRepo';
import { deriveWrongCardIds } from '@/domain/wrongbook/wrongBook';
import { fetchDictionary } from '@/platform/dictionary';
import { lookup as lookupLocalDict } from '@/platform/localDict';
import { useSettingsStore } from '@/stores/settings';
import { useProgressStore } from '@/stores/progress';
import { useAnimatedNumber } from '@/composables/useAnimatedNumber';
import type { Grade } from '@/domain/types';
import type { WordRecord, CardRecord } from '@/data/types';

const router = useRouter();
const route = useRoute();
const settings = useSettingsStore();
const progress = useProgressStore();

const loading = ref(true);
const session = shallowRef<StudySession | null>(null);
const currentWord = ref<WordRecord | null>(null);
const sessionStats = ref({ total: 0 });
const feedback = ref<'wrong' | 'right' | 'soft' | null>(null);
// 防重入：评分动画/落库期间忽略后续 grade 调用，避免按钮+键盘+滑动同时触发
// 导致 session.grade 在 phase=presenting 时被二次调用而早退（事件丢失/UI 卡住）
const grading = ref(false);
const mode = computed<'normal' | 'wrong'>(() =>
  route.query.mode === 'wrong' ? 'wrong' : 'normal',
);

onMounted(async () => {
  await waitForSeeds();
  await settings.load();
  const now = Date.now();
  let queue: CardRecord[] = [];
  if (mode.value === 'wrong') {
    const since = now - settings.settings.wrongWindowDays * 24 * 60 * 60 * 1000;
    const logs = await reviewLogRepo.listSince(since);
    const wrongIds = deriveWrongCardIds(
      logs,
      settings.settings.wrongWindowDays,
      now,
      settings.settings.wrongMaxGrade,
    );
    const cards = await Promise.all(wrongIds.map((id) => cardRepo.getById(id)));
    queue = cards.filter((c): c is CardRecord => Boolean(c));
  } else {
    const activeIds = settings.settings.activeWordbookIds;
    const activeSet = new Set(activeIds);
    const inActive = (c: CardRecord) =>
      activeSet.size === 0 || c.wordbooks.some((w) => activeSet.has(w));

    // 按需查三类，避免全量扫表。reviews 走 [state+dueAt] 索引拿到期，再 in-memory 过词书。
    const dueReviews = await cardRepo.listDueReviews(now);
    const reviews = activeSet.size === 0 ? dueReviews : dueReviews.filter(inActive);
    const learnings = await cardRepo.listByStateAndWordbooks('learning', activeIds);
    const news = await cardRepo.listByStateAndWordbooks('new', activeIds);

    const newWordIds = news.map((c) => c.wordId);
    const freqRankByWord = await wordRepo.getFreqRankMap(newWordIds);
    queue = buildTodaySession({
      settings: settings.settings,
      reviews,
      learnings,
      news,
      freqRankByWord,
      now,
    });
  }
  sessionStats.value.total = queue.length;
  session.value = new StudySession(queue, {
    desiredRetention: settings.settings.desiredRetention,
    weights: settings.settings.fsrsWeights,
  });
  await loadCurrentWord();
  loading.value = false;
});

async function loadCurrentWord() {
  const card = session.value?.current;
  if (!card) {
    currentWord.value = null;
    return;
  }
  const w = (await wordRepo.getById(card.wordId)) ?? null;
  currentWord.value = w;
  // 懒加载：缺音标/释义/音频/例句任一时后台拉取，不阻塞 UI
  if (
    w &&
    (!w.phonetic || !w.translations?.length || !w.audioUrl || !w.examples?.length)
  ) {
    void enrichWord(w);
  }
}

async function enrichWord(w: WordRecord) {
  // 1) 本地 ECDICT：优先填中文释义/音标 + 元数据（tag/bnc/frq）。命中后大概率不再需要走在线，省 5xx/限流。
  try {
    const local = await lookupLocalDict(w.word);
    if (local) {
      await wordRepo.patchEmptyFields(w.id, {
        phonetic: local.phonetic,
        translations: local.translations.length ? local.translations : undefined,
        exchange: local.exchange,
        tag: local.tag,
        bnc: local.bnc,
        frq: local.frq,
      });
    }
  } catch {
    /* 本地字典不可用静默忽略 */
  }

  // 2) Free Dictionary：补 audioUrl / 英文 examples。中文释义已被本地填了，patchEmptyFields 不会覆盖。
  try {
    const r = await fetchDictionary(w.word);
    if (r) {
      await wordRepo.patchEmptyFields(w.id, {
        phonetic: r.phonetic,
        audioUrl: r.audioUrl,
        examples: r.examples,
      });
    }
  } catch {
    /* 离线/限流：静默兜底（用 platform/tts.ts 系统语音） */
  }

  if (currentWord.value?.id === w.id) {
    currentWord.value = (await wordRepo.getById(w.id)) ?? currentWord.value;
  }
}

const phase = computed(() => session.value?.phase ?? 'done');
const remaining = computed(() => session.value?.remaining ?? 0);
const eventsCount = computed(() => session.value?.events.length ?? 0);
const revealed = computed(() => phase.value === 'revealed');

function reveal() {
  if (!session.value) return;
  if (session.value.phase === 'presenting') {
    session.value.reveal(Date.now());
    triggerRef(session);
  }
}

async function onGrade(g: Grade) {
  if (!session.value) return;
  if (grading.value) return;
  if (session.value.phase !== 'revealed') return;
  grading.value = true;
  try {
    // 评分反馈：grade 0 = 不会（Again），>=2 = 记得（Good/Easy），1 = 模糊（Hard）
    feedback.value = g === 0 ? 'wrong' : g >= 2 ? 'right' : 'soft';
    // 让反馈动画有 ~280ms 帧位
    await new Promise((r) => setTimeout(r, 280));
    feedback.value = null;

    const event = session.value.grade(g, Date.now());
    triggerRef(session);
    if (event) await persistEvent(event);
    await loadCurrentWord();
  } finally {
    grading.value = false;
  }
}

async function persistEvent(event: ReviewEvent) {
  await cardRepo.upsert(event.nextCard);
  if (event.firstReviewInSession) {
    await reviewLogRepo.append({
      cardId: event.cardId,
      reviewedAt: event.reviewedAt,
      grade: event.grade,
      prevInterval: event.prevInterval,
      nextInterval: event.nextInterval,
      durationMs: event.durationMs,
    });
  }
}

const correctCount = computed(() => session.value?.events.filter((e) => e.grade >= 2).length ?? 0);

const progressPct = computed(() => {
  const total = sessionStats.value.total;
  if (!total) return 0;
  return Math.min(100, Math.round(((total - remaining.value) / total) * 100));
});

// 已完成数（用于环形进度数字滚动）：total - remaining
const doneCount = computed(() =>
  Math.max(0, sessionStats.value.total - remaining.value),
);
const animatedDone = useAnimatedNumber(doneCount, { duration: 500 });
const displayedDone = computed(() => Math.round(animatedDone.value));

// 进度环参数：r=14, c=2πr ≈ 87.96
const RING_RADIUS = 14;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
const ringDashOffset = computed(
  () => RING_CIRC * (1 - progressPct.value / 100),
);

async function backHome() {
  await progress.refresh();
  router.replace({ name: 'home' });
}

// 礼花：每片随机左右起点 + 颜色 + 延迟，CSS 动画落下旋转
const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#fbbf24', '#16a34a', '#1677ff', '#a78bfa'];
function confettiStyle(i: number) {
  // 用 i 生成稳定但分布看似随机的参数（避免 mount 时重计算抖动）
  const left = ((i * 37) % 100) + (i % 5) * 0.5; // 0-100 散布
  const delay = ((i * 73) % 700) / 1000; // 0-0.7s
  const dur = 1.6 + ((i * 13) % 9) / 10; // 1.6-2.5s
  const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
  const rot = (i * 53) % 360;
  return {
    left: left + '%',
    animationDelay: delay + 's',
    animationDuration: dur + 's',
    background: color,
    transform: `rotate(${rot}deg)`,
  };
}
</script>

<template>
  <div class="study">
    <NavBar
      :title="mode === 'wrong' ? '错词复习' : '学习'"
      left-text="返回"
      left-arrow
      @click-left="backHome"
    >
      <template #right>
        <div v-if="!loading && phase !== 'done'" class="ring-wrap" aria-label="进度">
          <svg class="ring" :width="36" :height="36" viewBox="0 0 36 36">
            <circle
              class="ring-track"
              cx="18"
              cy="18"
              :r="RING_RADIUS"
              fill="none"
              stroke-width="3"
            />
            <circle
              class="ring-fill"
              cx="18"
              cy="18"
              :r="RING_RADIUS"
              fill="none"
              stroke-width="3"
              :stroke-dasharray="RING_CIRC"
              :stroke-dashoffset="ringDashOffset"
              transform="rotate(-90 18 18)"
            />
          </svg>
          <span class="ring-text">{{ displayedDone }}<span class="ring-total">/{{ sessionStats.total }}</span></span>
        </div>
      </template>
    </NavBar>

    <div
      v-if="!loading && phase !== 'done' && sessionStats.total > 0"
      class="topbar"
    >
      <div class="topbar-fill" :style="{ width: progressPct + '%' }"></div>
    </div>

    <div v-if="loading" class="state-center">
      <Loading type="spinner" />
    </div>

    <template v-else-if="phase === 'done'">
      <div class="done-wrap">
        <!-- 完成礼花：sessionStats.total>0 才放，空集合用静态咖啡杯 -->
        <div v-if="sessionStats.total > 0" class="confetti" aria-hidden="true">
          <i
            v-for="i in 24"
            :key="i"
            class="confetti-piece"
            :style="confettiStyle(i)"
          ></i>
        </div>
        <div class="done-emoji">{{ sessionStats.total === 0 ? '☕' : '🎉' }}</div>
        <div class="done-title">
          {{ sessionStats.total === 0 ? '今天没有需要学习的卡片' : '本次学习完成' }}
        </div>
        <div class="done-sub" v-if="sessionStats.total === 0">
          来得早不如来得巧，明天再继续吧
        </div>
        <div class="done-stats" v-else>
          <div class="done-stat">
            <div class="done-stat-num">{{ eventsCount }}</div>
            <div class="done-stat-label">评分次数</div>
          </div>
          <div class="done-stat done-stat-hi">
            <div class="done-stat-num">{{ correctCount }}</div>
            <div class="done-stat-label">认识</div>
          </div>
          <div class="done-stat">
            <div class="done-stat-num">
              {{ eventsCount === 0 ? 0 : Math.round((correctCount / eventsCount) * 100) }}%
            </div>
            <div class="done-stat-label">准确率</div>
          </div>
        </div>
        <button class="back-btn" @click="backHome">返回首页</button>
      </div>
    </template>

    <template v-else>
      <div class="card-area" @click="reveal">
        <transition name="card-fade">
          <WordCard
            v-if="currentWord"
            :key="currentWord.id"
            :word="currentWord"
            :card="session?.current ?? null"
            :revealed="revealed"
            :feedback="feedback"
            @swipe-grade="onGrade"
          />
          <div v-else class="state-center">词条数据缺失</div>
        </transition>
      </div>
      <AnswerBar v-if="revealed" @grade="onGrade" />
      <div v-else class="reveal-hint">
        <button class="reveal-btn" @click="reveal">显示释义</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.study {
  min-height: 100vh;
  background: var(--el-bg-page);
  display: flex;
  flex-direction: column;
}
.counter {
  color: var(--el-text-tertiary);
  font-size: var(--el-font-md);
  font-variant-numeric: tabular-nums;
}
.ring-wrap {
  position: relative;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ring {
  display: block;
}
.ring-track {
  stroke: var(--el-border-light);
}
.ring-fill {
  stroke: var(--el-primary-500);
  transition: stroke-dashoffset 0.4s cubic-bezier(0.2, 0.7, 0.3, 1);
  stroke-linecap: round;
}
.ring-text {
  position: absolute;
  font-size: 11px;
  font-weight: 700;
  color: var(--el-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  display: inline-flex;
  align-items: baseline;
}
.ring-total {
  font-size: 9px;
  color: var(--el-text-tertiary);
  font-weight: 500;
}
.topbar {
  height: 3px;
  background: var(--el-border-light);
  position: relative;
  overflow: hidden;
}
.topbar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, #6c8eff, #1677ff);
  transition: width 0.4s ease;
}
.state-center {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 16px;
  color: var(--el-text-tertiary);
}
.card-area {
  flex: 1;
  display: flex;
  align-items: stretch;
  cursor: pointer;
}
.card-area > * {
  flex: 1;
}

/* 卡片切换动画：淡入 + 微抬升 */
.card-fade-enter-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.card-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.card-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.card-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.reveal-hint {
  padding: var(--el-space-3) var(--el-space-4) var(--el-space-6);
  background: var(--el-bg-card);
  border-top: 1px solid var(--el-border-light);
}
.reveal-btn {
  width: 100%;
  background: var(--el-bg-card);
  border: 2px dashed var(--el-primary-300);
  color: var(--el-primary-500);
  border-radius: var(--el-radius-md);
  padding: 14px 0;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}
.reveal-btn:active {
  background: var(--el-primary-50);
}

/* 完成态 */
.done-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--el-space-8) var(--el-space-4);
  position: relative;
  overflow: hidden;
}

/* 礼花：顶部 -10% 高度起，下落 + 旋转 + 淡出 */
.confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.confetti-piece {
  position: absolute;
  top: -10%;
  width: 8px;
  height: 14px;
  border-radius: 2px;
  opacity: 0;
  animation: confetti-fall ease-out forwards;
}
@keyframes confetti-fall {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translateY(110vh) rotate(720deg);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .confetti {
    display: none;
  }
}

.done-emoji {
  font-size: 56px;
  margin-bottom: var(--el-space-4);
  animation: done-emoji-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes done-emoji-pop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .done-emoji {
    animation: none;
  }
}

.done-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-primary);
}
.done-sub {
  margin-top: var(--el-space-2);
  color: var(--el-text-secondary);
  font-size: var(--el-font-md);
}
.done-sub b {
  color: var(--el-primary-500);
  font-weight: 600;
}

/* 三联统计：评分 / 认识 / 准确率 */
.done-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--el-space-6);
  margin-top: var(--el-space-6);
  padding: 0 var(--el-space-4);
}
.done-stat {
  text-align: center;
}
.done-stat-num {
  font-size: 30px;
  font-weight: 800;
  color: var(--el-text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  animation: done-num-rise 0.5s ease-out 0.1s both;
}
.done-stat-hi .done-stat-num {
  color: var(--el-primary-500);
  background: var(--el-hero-grad);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.done-stat-label {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-tertiary);
}
@keyframes done-num-rise {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .done-stat-num {
    animation: none;
  }
}

.back-btn {
  margin-top: var(--el-space-8);
  background: var(--el-hero-grad);
  color: #fff;
  border: none;
  border-radius: var(--el-radius-lg);
  padding: 14px 40px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--el-shadow-cta);
  position: relative;
  z-index: 1;
}
.back-btn:active {
  transform: scale(0.98);
}
</style>
