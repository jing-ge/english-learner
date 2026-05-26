<script setup lang="ts">
import { computed } from 'vue';
import { forgetting_curve, generatorParameters } from 'ts-fsrs';

const props = defineProps<{
  stability: number;
  elapsedDays: number;
  lastReviewedAt?: number;
  dueAt: number;
  now: number;
  weights?: number[];
}>();

const DAY_MS = 86_400_000;
const W = props.weights ?? generatorParameters().w;

// 横轴范围：从 0 到 max(scheduled_days * 1.5, 14) 天
const scheduledDays = computed(() =>
  props.lastReviewedAt ? Math.max(1, Math.round((props.dueAt - props.lastReviewedAt) / DAY_MS)) : 7,
);
const maxDay = computed(() => Math.max(Math.ceil(scheduledDays.value * 1.5), 14));
const steps = 60;

// 当前可提取率
const currentR = computed(() =>
  props.stability > 0 ? forgetting_curve(W, props.elapsedDays, props.stability) : 1,
);

// 到期时可提取率
const dueR = computed(() =>
  props.stability > 0 ? forgetting_curve(W, scheduledDays.value, props.stability) : 0.9,
);

// SVG 布局
const CHART_W = 280;
const CHART_H = 90;
const PAD = { top: 8, right: 8, bottom: 18, left: 30 };
const innerW = CHART_W - PAD.left - PAD.right;
const innerH = CHART_H - PAD.top - PAD.bottom;

function x(day: number): number {
  return PAD.left + (day / maxDay.value) * innerW;
}
function y(r: number): number {
  return PAD.top + innerH * (1 - r);
}

// 曲线路径
const curvePath = computed(() => {
  if (props.stability <= 0) return '';
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = (i / steps) * maxDay.value;
    const r = forgetting_curve(W, d, props.stability);
    pts.push(`${i === 0 ? 'M' : 'L'}${x(d).toFixed(1)} ${y(r).toFixed(1)}`);
  }
  return pts.join(' ');
});

// 目标留存率虚线（R=desiredRetention，由 scheduled_days 近似反推）
const targetLineY = computed(() => y(dueR.value));

// 当前位置标记
const currentDayX = computed(() => x(props.elapsedDays));
const currentDayY = computed(() => y(currentR.value));

// 到期位置标记
const dueDayX = computed(() => x(scheduledDays.value));
const dueDayY = computed(() => y(dueR.value));
</script>

<template>
  <div class="memory-curve" v-if="stability > 0">
    <div class="section-title">记忆曲线</div>
    <svg class="chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`">
      <!-- 网格线 -->
      <line class="grid" :x1="PAD.left" :x2="CHART_W - PAD.right" :y1="y(0.5)" :y2="y(0.5)" />
      <line class="grid" :x1="PAD.left" :x2="CHART_W - PAD.right" :y1="y(1)" :y2="y(1)" />

      <!-- 目标留存率虚线 -->
      <line
        class="target-line"
        :x1="PAD.left"
        :x2="CHART_W - PAD.right"
        :y1="targetLineY"
        :y2="targetLineY"
      />

      <!-- 留存曲线 -->
      <path :d="curvePath" class="curve" fill="none" />

      <!-- 当前位置 -->
      <circle v-if="elapsedDays >= 0" :cx="currentDayX" :cy="currentDayY" r="3.5" class="dot-current" />

      <!-- 到期点 -->
      <line :x1="dueDayX" :y1="PAD.top" :x2="dueDayX" :y2="CHART_H - PAD.bottom" class="due-line" />
      <circle :cx="dueDayX" :cy="dueDayY" r="3" class="dot-due" />

      <!-- 轴标签 -->
      <text :x="PAD.left" :y="PAD.top + 2" class="tick" text-anchor="end">100%</text>
      <text :x="PAD.left" :y="CHART_H - PAD.bottom + 2" class="tick" text-anchor="end">0%</text>
      <text :x="PAD.left + 2" :y="CHART_H - 3" class="tick">今天</text>
      <text :x="CHART_W - PAD.right" :y="CHART_H - 3" class="tick" text-anchor="end">+{{ maxDay }}天</text>
    </svg>
    <div class="curve-info">
      <span class="info-item">当前留存 <strong>{{ Math.round(currentR * 100) }}%</strong></span>
      <span class="info-item">到期留存 <strong>{{ Math.round(dueR * 100) }}%</strong></span>
    </div>
  </div>
</template>

<style scoped>
.memory-curve {
  border-top: 1px solid var(--el-border-light);
  padding-top: var(--el-space-4);
  margin-bottom: var(--el-space-5);
}
.section-title {
  color: var(--el-text-tertiary);
  font-size: var(--el-font-xs);
  font-weight: 500;
  letter-spacing: 1px;
  margin-bottom: var(--el-space-2);
  text-transform: uppercase;
}
.chart {
  width: 100%;
  height: 90px;
  display: block;
}
.grid {
  stroke: var(--el-border-light);
  stroke-width: 0.5;
  stroke-dasharray: 2 3;
}
.target-line {
  stroke: var(--el-primary-300);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  opacity: 0.7;
}
.curve {
  stroke: var(--el-primary-500);
  stroke-width: 2;
  stroke-linecap: round;
}
.due-line {
  stroke: var(--el-text-tertiary);
  stroke-width: 0.8;
  stroke-dasharray: 3 3;
  opacity: 0.5;
}
.dot-current {
  fill: var(--el-primary-500);
}
.dot-due {
  fill: var(--el-text-tertiary);
}
.tick {
  font-size: 9px;
  fill: var(--el-text-tertiary);
}
.curve-info {
  display: flex;
  gap: var(--el-space-5);
  margin-top: var(--el-space-2);
  font-size: 12px;
  color: var(--el-text-secondary);
}
.info-item strong {
  color: var(--el-primary-500);
  font-weight: 600;
}
</style>
