<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from 'vant';
import { youdaoTtsUrl } from '@/platform/tts';
import { playAudio } from '@/platform/audioCache';
import { useSettingsStore } from '@/stores/settings';
import { highlightSentence } from '@/domain/text/highlight';
import { parseExchange, morphLabels, lookupRoots } from '@/platform/morpho';
import { parseTagBadges, freqBucket } from '@/platform/wordMeta';
import type { WordRecord } from '@/data/types';
import type { Grade } from '@/domain/types';

const props = defineProps<{
  word: WordRecord;
  revealed: boolean;
  feedback?: 'wrong' | 'right' | 'soft' | null;
}>();

const emit = defineEmits<{
  (e: 'swipe-grade', g: Grade): void;
}>();

const settings = useSettingsStore();

const phonetic = computed(() => props.word.phonetic ?? '');
const translations = computed(() => props.word.translations ?? []);
const examples = computed(() => props.word.examples ?? []);
const collocations = computed(() => props.word.collocations ?? []);

const morphForms = computed(() => morphLabels(parseExchange(props.word.exchange)));
const roots = computed(() => lookupRoots(props.word.word));
const tagBadges = computed(() => parseTagBadges(props.word.tag));
const freqBadge = computed(() => freqBucket(props.word.bnc, props.word.frq));

const highlightedExamples = computed(() =>
  examples.value.map((ex) => ({
    tokens: highlightSentence(ex.en, props.word.word),
    zh: ex.zh,
  })),
);

function pronounce(e: Event) {
  e.stopPropagation();
  const accent = settings.settings.ttsAccent;
  // 真人发音三级链：Free Dictionary audioUrl → 有道真人 → SpeechSynthesis 合成
  const url = props.word.audioUrl || youdaoTtsUrl(props.word.word, accent);
  void playAudio(url, { text: props.word.word, accent });
}

// ===== 滑动手势答评（仅在 revealed=true 时启用）=====
// 左滑 → grade 0（不认识）；右滑 → grade 2（模糊/认识）。
// 中间两挡（陌生 1 / 认识 3）保留按钮，避免上下滑与例句滚动冲突。
const SWIPE_THRESHOLD = 80;
const drag = ref<{ active: boolean; dx: number }>({ active: false, dx: 0 });
let pointerId: number | null = null;
let startX = 0;
let startY = 0;
let lockedAxis: 'x' | 'y' | null = null;

function onPointerDown(e: PointerEvent) {
  if (!props.revealed) return;
  // 滚动条/按钮区域不拦
  const target = e.target as HTMLElement;
  if (target.closest('button, .speak, .examples, .roots, .collocations')) return;
  pointerId = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;
  lockedAxis = null;
  drag.value = { active: true, dx: 0 };
}

function onPointerMove(e: PointerEvent) {
  if (!drag.value.active || e.pointerId !== pointerId) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  if (lockedAxis === null) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  if (lockedAxis === 'y') {
    // 让位给纵向滚动
    drag.value = { active: false, dx: 0 };
    pointerId = null;
    return;
  }
  drag.value.dx = dx;
}

function onPointerUp(e: PointerEvent) {
  if (!drag.value.active || e.pointerId !== pointerId) {
    drag.value = { active: false, dx: 0 };
    pointerId = null;
    return;
  }
  const dx = drag.value.dx;
  drag.value = { active: false, dx: 0 };
  pointerId = null;
  if (dx <= -SWIPE_THRESHOLD) emit('swipe-grade', 0);
  else if (dx >= SWIPE_THRESHOLD) emit('swipe-grade', 2);
}

const swipeStyle = computed(() => {
  if (!drag.value.active) return {};
  const dx = drag.value.dx;
  // 拖动反馈：轻微旋转 + 跟随，最多 ±10deg
  const rot = Math.max(-10, Math.min(10, dx / 12));
  return {
    transform: `translateX(${dx}px) rotate(${rot}deg)`,
    transition: 'none',
  };
});

const swipeHint = computed<'left' | 'right' | null>(() => {
  if (!drag.value.active) return null;
  const dx = drag.value.dx;
  if (dx <= -SWIPE_THRESHOLD / 2) return 'left';
  if (dx >= SWIPE_THRESHOLD / 2) return 'right';
  return null;
});
</script>

<template>
  <!-- 3D 翻面：scene 提供 perspective，flipper 内部 rotateY -->
  <!-- 拖动位移挂在外层 wrapper，不能挂 .flipper（会覆盖 rotateY 翻面） -->
  <div
    class="swipe-wrap"
    :style="swipeStyle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div
      class="card-scene"
      :class="{
        'fb-wrong': feedback === 'wrong',
        'fb-right': feedback === 'right',
        'fb-soft': feedback === 'soft',
        'hint-left': swipeHint === 'left',
        'hint-right': swipeHint === 'right',
      }"
    >
      <div class="flipper" :class="{ flipped: revealed }">
      <!-- 正面 -->
      <section class="face face-front">
        <div class="word-row">
          <span class="word">{{ word.word }}</span>
          <button class="speak" @click="pronounce" aria-label="发音">
            <Icon name="volume-o" size="22" />
          </button>
        </div>
        <div v-if="phonetic" class="phonetic">{{ phonetic }}</div>
        <div class="hint">点击屏幕查看释义</div>
      </section>

      <!-- 背面 -->
      <section class="face face-back">
        <div class="word-row">
          <span class="word word-sm">{{ word.word }}</span>
          <button class="speak" @click="pronounce" aria-label="发音">
            <Icon name="volume-o" size="20" />
          </button>
        </div>
        <div v-if="phonetic" class="phonetic phonetic-sm">{{ phonetic }}</div>

        <div
          v-if="tagBadges.length || freqBadge"
          class="meta-badges"
        >
          <span
            v-if="freqBadge"
            class="badge badge-freq"
            :class="`badge-freq-${freqBadge.level}`"
          >{{ freqBadge.label }}</span>
          <span
            v-for="b in tagBadges"
            :key="b.code"
            class="badge badge-tag"
          >{{ b.label }}</span>
        </div>

        <ul class="translations">
          <li v-for="(t, i) in translations" :key="i">
            <span v-if="t.pos" class="pos">{{ t.pos }}</span>
            <span class="meaning">{{ t.meaning }}</span>
          </li>
        </ul>

        <div v-if="collocations.length" class="collocations">
          <div class="section-title">常用搭配</div>
          <div class="chips">
            <div v-for="(c, i) in collocations" :key="i" class="chip">
              <span class="chip-en">{{ c.phrase }}</span>
              <span v-if="c.zh" class="chip-zh">{{ c.zh }}</span>
            </div>
          </div>
        </div>

        <div v-if="morphForms.length" class="morph">
          <div class="section-title">变形</div>
          <div class="morph-rows">
            <div v-for="(m, i) in morphForms" :key="i" class="morph-row">
              <span class="morph-label">{{ m.label }}</span>
              <span class="morph-value">{{ m.value }}</span>
            </div>
          </div>
        </div>

        <div v-if="roots.length" class="roots">
          <div class="section-title">词根联想</div>
          <div v-for="r in roots" :key="r.root" class="root-block">
            <div class="root-head">
              <span class="root-name">{{ r.root }}</span>
              <span class="root-meaning">{{ r.meaning }}</span>
              <span v-if="r.origin" class="root-origin">{{ r.origin }}</span>
            </div>
            <div v-if="r.siblings.length" class="root-siblings">
              <span v-for="s in r.siblings" :key="s" class="sib">{{ s }}</span>
            </div>
          </div>
        </div>

        <div v-if="highlightedExamples.length" class="examples">
          <div class="section-title">例句</div>
          <div v-for="(ex, i) in highlightedExamples" :key="i" class="example">
            <div class="en">
              <template v-for="(tk, j) in ex.tokens" :key="j">
                <mark v-if="tk.hit" class="hit">{{ tk.text }}</mark>
                <span v-else>{{ tk.text }}</span>
              </template>
            </div>
            <div v-if="ex.zh" class="zh">{{ ex.zh }}</div>
          </div>
        </div>
      </section>
    </div>
    </div>
    <!-- 滑动方向角标：左红/右绿，距离越大越亮 -->
    <div
      v-if="swipeHint === 'left'"
      class="swipe-badge swipe-badge-left"
      :style="{ opacity: Math.min(1, Math.abs(drag.dx) / 80) }"
    >不会</div>
    <div
      v-if="swipeHint === 'right'"
      class="swipe-badge swipe-badge-right"
      :style="{ opacity: Math.min(1, Math.abs(drag.dx) / 80) }"
    >记得</div>
  </div>
</template>

<style scoped>
/*
 * 滑动手势容器
 * 拖动位移挂在 .swipe-wrap 上而不是 .flipper，避免 transform 覆盖 .flipper.flipped 的 rotateY(180deg)
 * 释放时由 transition 缓回 0
 */
.swipe-wrap {
  position: relative;
  display: flex;
  flex: 1;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  touch-action: pan-y; /* 允许纵向滚动，横向我们自己接管 */
}
.swipe-badge {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 2px;
  padding: 10px 16px;
  border-radius: var(--el-radius-md);
  pointer-events: none;
  transition: opacity 0.1s ease;
  z-index: 2;
}
.swipe-badge-left {
  left: var(--el-space-4);
  border: 3px solid #ef4444;
  color: #ef4444;
  background: rgba(254, 226, 226, 0.9);
  transform: translateY(-50%) rotate(-12deg);
}
.swipe-badge-right {
  right: var(--el-space-4);
  border: 3px solid #16a34a;
  color: #16a34a;
  background: rgba(220, 252, 231, 0.9);
  transform: translateY(-50%) rotate(12deg);
}
/* 拖动方向 hint：边框轻染 */
.card-scene.hint-left .face {
  box-shadow:
    var(--el-shadow-md),
    0 0 0 2px rgba(239, 68, 68, 0.6);
}
.card-scene.hint-right .face {
  box-shadow:
    var(--el-shadow-md),
    0 0 0 2px rgba(34, 197, 94, 0.6);
}

/*
 * 3D 翻面
 * 结构：.card-scene (perspective) > .flipper (rotateY) > .face-front + .face-back
 * 翻面用 transform: rotateY(180deg)；两个 face 用 backface-visibility:hidden 互相隐藏
 * 注意：.face-back 出生就是 rotateY(180deg)（这样 flipper 翻 180 后它正好朝前）
 */
.card-scene {
  margin: var(--el-space-4);
  perspective: 1600px;
  display: flex;
  flex: 1;
}.flipper {
  position: relative;
  flex: 1;
  min-height: 280px;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.2, 0.7, 0.3, 1);
}
.flipper.flipped {
  transform: rotateY(180deg);
}
.face {
  position: absolute;
  inset: 0;
  background: var(--el-bg-card);
  border-radius: var(--el-radius-lg);
  padding: var(--el-space-8) var(--el-space-5);
  box-shadow: var(--el-shadow-md);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: flex;
  flex-direction: column;
}
.face-front {
  align-items: center;
  justify-content: center;
  text-align: center;
}
.face-back {
  transform: rotateY(180deg);
  /* 背面比正面信息密集，要可滚动 */
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* 正面元素 */
.face-front .word-row {
  display: flex;
  align-items: center;
  gap: var(--el-space-3);
  justify-content: center;
}
.face-front .word {
  font-size: 38px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--el-text-primary);
}
.face-front .phonetic {
  margin-top: var(--el-space-2);
  font-size: 16px;
  color: var(--el-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.face-front .hint {
  margin-top: var(--el-space-6);
  font-size: 13px;
  color: var(--el-text-tertiary);
}

/* 背面布局 */
.face-back .word-row {
  display: flex;
  align-items: center;
  gap: var(--el-space-2);
  margin-bottom: var(--el-space-1);
}
.word-sm {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-primary);
}
.phonetic-sm {
  font-size: 13px;
  color: var(--el-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  margin-bottom: var(--el-space-2);
}

.speak {
  background: transparent;
  border: none;
  padding: 6px;
  border-radius: 999px;
  color: var(--el-primary-500);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.speak:active {
  background: var(--el-primary-50);
}

.translations {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--el-space-5) 0;
}
.meta-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 var(--el-space-4);
}
.badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 999px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
.badge-tag {
  color: var(--el-text-secondary);
  background: var(--el-bg-soft);
  border: 1px solid var(--el-border-light);
}
.badge-freq-high {
  color: #b91c1c;
  background: #fee2e2;
  border: 1px solid #fecaca;
}
.badge-freq-mid {
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
}
.badge-freq-low {
  color: var(--el-text-tertiary);
  background: var(--el-bg-soft);
  border: 1px solid var(--el-border-light);
}
.translations li {
  padding: 6px 0;
  font-size: 16px;
  color: var(--el-text-primary);
  line-height: 1.5;
}
.pos {
  display: inline-block;
  color: var(--el-primary-500);
  background: var(--el-primary-50);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  margin-right: var(--el-space-2);
  font-style: normal;
  font-weight: 500;
  vertical-align: middle;
}
.section-title {
  color: var(--el-text-tertiary);
  font-size: var(--el-font-xs);
  font-weight: 500;
  letter-spacing: 1px;
  margin-bottom: var(--el-space-3);
  text-transform: uppercase;
}
.collocations {
  border-top: 1px solid var(--el-border-light);
  padding-top: var(--el-space-4);
  margin-bottom: var(--el-space-5);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--el-space-2);
}
.chip {
  background: var(--el-primary-50);
  border: 1px solid var(--el-primary-100);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  line-height: 1.4;
  transition: transform 0.1s ease, box-shadow 0.15s ease;
}
.chip:active {
  transform: translateY(-1px);
  box-shadow: var(--el-shadow-sm);
}
.chip-en {
  color: var(--el-primary-600);
  font-weight: 600;
}
.chip-zh {
  color: var(--el-text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.examples {
  border-top: 1px solid var(--el-border-light);
  padding-top: var(--el-space-4);
}
.morph {
  border-top: 1px solid var(--el-border-light);
  padding-top: var(--el-space-4);
  margin-bottom: var(--el-space-5);
}
.morph-rows {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: var(--el-space-3);
  row-gap: 6px;
  font-size: 13px;
}
.morph-label {
  color: var(--el-text-tertiary);
}
.morph-value {
  color: var(--el-text-primary);
  font-weight: 500;
}
.roots {
  border-top: 1px solid var(--el-border-light);
  padding-top: var(--el-space-4);
  margin-bottom: var(--el-space-5);
}
.root-block {
  margin-bottom: var(--el-space-3);
}
.root-block:last-child {
  margin-bottom: 0;
}
.root-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--el-space-2);
  margin-bottom: 6px;
}
.root-name {
  font-weight: 700;
  color: var(--el-purple-500);
  background: #f3e8ff;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 13px;
  letter-spacing: 0.5px;
}
.root-meaning {
  font-size: 13px;
  color: var(--el-text-secondary);
}
.root-origin {
  font-size: 11px;
  color: var(--el-text-tertiary);
  font-style: italic;
}
.root-siblings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sib {
  font-size: 12px;
  color: var(--el-text-secondary);
  background: var(--el-bg-soft);
  border-radius: 6px;
  padding: 2px 8px;
}
.example {
  margin-bottom: var(--el-space-4);
  padding-left: 10px;
  border-left: 3px solid var(--el-primary-100);
}
.example:last-child {
  margin-bottom: 0;
}
.en {
  color: var(--el-text-primary);
  font-size: 14px;
  line-height: 1.6;
}
.hit {
  background: var(--el-primary-100);
  color: var(--el-primary-600);
  border-radius: 3px;
  padding: 0 2px;
}
.zh {
  color: var(--el-text-secondary);
  font-size: 13px;
  margin-top: 4px;
  line-height: 1.5;
}

/* 减弱动画偏好：直接消除翻转动画，靠 .flipped 切换瞬间显示背面 */
@media (prefers-reduced-motion: reduce) {
  .flipper {
    transition: none;
  }
  /* 用 visibility 替代 3D 翻转：未翻面隐背面，翻面时隐正面 */
  .face-back {
    transform: none;
    visibility: hidden;
  }
  .flipper.flipped .face-back {
    visibility: visible;
  }
  .flipper.flipped .face-front {
    visibility: hidden;
  }
  .flipper.flipped {
    transform: none;
  }
}

/*
 * 评分反馈动画
 * 280ms 一次性触发：边框/光晕染色 + 当前可见 face 的位移/缩放反馈。
 * 不动 .flipper 的 transform，避免破坏 .flipped 的 rotateY 翻面状态。
 * 正面用 .face-front 做位移，背面用 .face-back（自带 rotateY(180deg)）做位移。
 */
.card-scene.fb-wrong .face {
  box-shadow:
    var(--el-shadow-md),
    0 0 0 2px var(--el-danger-500, #ef4444),
    0 0 24px rgba(239, 68, 68, 0.35);
  transition: box-shadow 0.18s ease;
}
.card-scene.fb-right .face {
  box-shadow:
    var(--el-shadow-md),
    0 0 0 2px #16a34a,
    0 0 28px rgba(34, 197, 94, 0.4);
  transition: box-shadow 0.18s ease;
}
.card-scene.fb-soft .face {
  box-shadow:
    var(--el-shadow-md),
    0 0 0 2px var(--el-primary-300),
    0 0 22px rgba(22, 119, 255, 0.3);
  transition: box-shadow 0.18s ease;
}

/* 正面（未翻面）反馈：直接对 face-front 做位移/缩放 */
.flipper:not(.flipped) .face-front {
  animation-fill-mode: both;
}
.card-scene.fb-wrong .flipper:not(.flipped) .face-front {
  animation: fb-shake-front 0.28s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
.card-scene.fb-right .flipper:not(.flipped) .face-front {
  animation: fb-bump-front 0.28s ease-out;
}
.card-scene.fb-soft .flipper:not(.flipped) .face-front {
  animation: fb-pulse-front 0.28s ease-out;
}

/* 背面（已翻面）反馈：face-back 自身已经 rotateY(180deg)，叠加位移要保留 */
.card-scene.fb-wrong .flipper.flipped .face-back {
  animation: fb-shake-back 0.28s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
.card-scene.fb-right .flipper.flipped .face-back {
  animation: fb-bump-back 0.28s ease-out;
}
.card-scene.fb-soft .flipper.flipped .face-back {
  animation: fb-pulse-back 0.28s ease-out;
}

@keyframes fb-shake-front {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}
@keyframes fb-bump-front {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.025); }
}
@keyframes fb-pulse-front {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.012); }
}
/* 背面 keyframe 必须保留 rotateY(180deg) 否则翻回正面 */
@keyframes fb-shake-back {
  0%, 100% { transform: rotateY(180deg) translateX(0); }
  20% { transform: rotateY(180deg) translateX(-6px); }
  40% { transform: rotateY(180deg) translateX(5px); }
  60% { transform: rotateY(180deg) translateX(-3px); }
  80% { transform: rotateY(180deg) translateX(2px); }
}
@keyframes fb-bump-back {
  0%, 100% { transform: rotateY(180deg) scale(1); }
  50% { transform: rotateY(180deg) scale(1.025); }
}
@keyframes fb-pulse-back {
  0%, 100% { transform: rotateY(180deg) scale(1); }
  50% { transform: rotateY(180deg) scale(1.012); }
}

@media (prefers-reduced-motion: reduce) {
  .card-scene.fb-wrong .face,
  .card-scene.fb-right .face,
  .card-scene.fb-soft .face {
    animation: none !important;
  }
}
</style>
