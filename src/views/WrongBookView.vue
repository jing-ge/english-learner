<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { NavBar, Empty } from 'vant';
import { reviewLogRepo } from '@/data/repositories/reviewLogRepo';
import { wordRepo } from '@/data/repositories/wordRepo';
import { summarizeWrong, type WrongStat } from '@/domain/wrongbook/wrongBook';
import type { WordRecord } from '@/data/types';

const router = useRouter();
const loading = ref(true);
const stats = ref<WrongStat[]>([]);
const wordsById = ref<Map<string, WordRecord>>(new Map());

onMounted(async () => {
  const now = Date.now();
  const since = now - 14 * 24 * 60 * 60 * 1000;
  const logs = await reviewLogRepo.listSince(since);
  stats.value = summarizeWrong(logs, 14, now);

  // CardRecord.id === wordId（按 schema 约定），cardId 即 wordId
  const ids = stats.value.map((s) => s.cardId);
  const words = await Promise.all(ids.map((id) => wordRepo.getById(id)));
  const map = new Map<string, WordRecord>();
  for (const w of words) if (w) map.set(w.id, w);
  wordsById.value = map;
  loading.value = false;
});

const total = computed(() => stats.value.length);

function shortMeaning(w?: WordRecord): string {
  if (!w) return '';
  const t = w.translations?.[0];
  if (!t) return '';
  return [t.pos, t.meaning].filter(Boolean).join(' ');
}

function startWrongStudy() {
  router.push({ name: 'study', query: { mode: 'wrong' } });
}
</script>

<template>
  <div class="wrong">
    <NavBar title="错词本" left-text="返回" left-arrow @click-left="$router.back()" />

    <header class="head">
      <div class="head-num">
        {{ total }}<span class="head-unit">词</span>
      </div>
      <div class="head-sub">最近 14 天最后一次评分仍 ≤1 的词</div>
    </header>

    <button v-if="total > 0" class="cta" @click="startWrongStudy">
      集中刷错词
      <span class="cta-sub">{{ total }} 张待巩固</span>
    </button>

    <div v-if="loading" class="state-center">加载中…</div>
    <div v-else-if="total === 0" class="empty-wrap">
      <Empty description="近 14 天没有错词，继续保持！" />
    </div>
    <ul v-else class="list">
      <li
        v-for="s in stats"
        :key="s.cardId"
        class="row"
      >
        <div class="row-main">
          <div class="row-word">{{ wordsById.get(s.cardId)?.word ?? '' }}</div>
          <div class="row-meaning">{{ shortMeaning(wordsById.get(s.cardId)) }}</div>
        </div>
        <div class="row-side">
          <div class="row-wrong">{{ s.wrongCount }}/{{ s.totalCount }}</div>
          <div class="row-side-label">错次</div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wrong {
  min-height: 100vh;
  background: var(--el-bg-page);
}
.head {
  background: linear-gradient(135deg, #fb7185 0%, #f43f5e 100%);
  color: #fff;
  padding: var(--el-space-6) var(--el-space-4);
}
.head-num {
  font-size: 38px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.head-unit {
  font-size: 14px;
  font-weight: 500;
  margin-left: 4px;
  opacity: 0.85;
}
.head-sub {
  margin-top: 6px;
  font-size: 13px;
  opacity: 0.9;
}
.cta {
  display: block;
  width: calc(100% - 32px);
  margin: var(--el-space-4) auto 0;
  background: linear-gradient(135deg, #fb7185, #f43f5e);
  color: #fff;
  border: none;
  border-radius: var(--el-radius-lg);
  padding: 14px 0;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(244, 63, 94, 0.32);
}
.cta-sub {
  display: block;
  font-size: 11px;
  opacity: 0.85;
  font-weight: 400;
  margin-top: 2px;
}
.cta:active { transform: scale(0.98); }
.state-center {
  text-align: center;
  color: var(--el-text-tertiary);
  padding: var(--el-space-10) 0;
}
.empty-wrap {
  padding: var(--el-space-8) 0;
}
.list {
  list-style: none;
  margin: var(--el-space-4) 0;
  padding: 0;
  background: var(--el-bg-card);
}
.row {
  display: flex;
  align-items: center;
  padding: 14px var(--el-space-4);
  border-bottom: 1px solid var(--el-border-light);
}
.row:last-child { border-bottom: none; }
.row-main {
  flex: 1;
  min-width: 0;
}
.row-word {
  font-size: 17px;
  font-weight: 600;
  color: var(--el-text-primary);
  margin-bottom: 2px;
}
.row-meaning {
  font-size: 13px;
  color: var(--el-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-side {
  text-align: right;
  margin-left: var(--el-space-3);
}
.row-wrong {
  font-size: 16px;
  font-weight: 700;
  color: var(--el-danger-500);
  font-variant-numeric: tabular-nums;
}
.row-side-label {
  font-size: 11px;
  color: var(--el-text-tertiary);
  margin-top: 2px;
}
</style>
