<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import type { Grade } from '@/domain/types';

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ (e: 'grade', g: Grade): void }>();

interface BtnDef {
  grade: Grade;
  label: string;
  hint: string;
  cls: 'g0' | 'g1' | 'g2' | 'g3';
  shortcut: string;
}

const buttons: BtnDef[] = [
  { grade: 0, label: '不认识', hint: '<10m', cls: 'g0', shortcut: '1' },
  { grade: 1, label: '陌生', hint: '1d', cls: 'g1', shortcut: '2' },
  { grade: 2, label: '模糊', hint: '3d', cls: 'g2', shortcut: '3' },
  { grade: 3, label: '认识', hint: '7d+', cls: 'g3', shortcut: '4' },
];

function onKey(e: KeyboardEvent) {
  const idx = ['1', '2', '3', '4'].indexOf(e.key);
  if (idx >= 0) emit('grade', idx as Grade);
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="answer-bar">
    <button
      v-for="b in buttons"
      :key="b.grade"
      :class="['grade-btn', b.cls]"
      :disabled="disabled"
      @click="emit('grade', b.grade)"
    >
      <span class="label">{{ b.label }}</span>
      <span class="meta">
        <span class="shortcut">{{ b.shortcut }}</span>
        <span class="hint">{{ b.hint }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.answer-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 14px 16px calc(20px + env(safe-area-inset-bottom, 0));
  background: var(--el-bg-card);
  border-top: 1px solid var(--el-border-light);
}
.grade-btn {
  border: none;
  border-radius: var(--el-radius-md);
  padding: 12px 0 10px;
  font-size: 15px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  box-shadow: var(--el-shadow-sm);
  transition: transform 0.12s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.grade-btn:active:not(:disabled) {
  transform: translateY(1px) scale(0.97);
  box-shadow: none;
}
.grade-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.label {
  font-size: 14px;
  letter-spacing: 0.5px;
}
.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  opacity: 0.85;
}
.shortcut {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  padding: 1px 6px;
  font-weight: 600;
}
.hint {
  font-weight: 400;
}

.g0 {
  background: linear-gradient(135deg, #f87171, #ef4444);
}
.g1 {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
}
.g2 {
  background: linear-gradient(135deg, #60a5fa, #3b82f6);
}
.g3 {
  background: linear-gradient(135deg, #4ade80, #16a34a);
}
</style>
