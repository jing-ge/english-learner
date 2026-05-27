<script setup lang="ts">
import { ref } from 'vue';
import { lookup as lookupLocalDict, type LocalDictResult } from '@/platform/localDict';
import { youdaoTtsUrl } from '@/platform/tts';
import { playAudio } from '@/platform/audioCache';
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
const query = ref('');
const result = ref<LocalDictResult | null>(null);
const notFound = ref(false);
const searching = ref(false);

async function search() {
  const word = query.value.trim().toLowerCase();
  if (!word) return;
  searching.value = true;
  notFound.value = false;
  result.value = null;
  try {
    const r = await lookupLocalDict(word);
    if (r) {
      result.value = r;
    } else {
      notFound.value = true;
    }
  } catch {
    notFound.value = true;
  } finally {
    searching.value = false;
  }
}

function pronounce(word: string) {
  const accent = settings.settings.ttsAccent;
  void playAudio(youdaoTtsUrl(word, accent), { text: word, accent });
}

function onInputKey(e: KeyboardEvent) {
  if (e.key === 'Enter') search();
}
</script>

<template>
  <div class="lookup">
    <header class="page-hero">
      <div class="hero-title">查词</div>
      <div class="hero-sub">输入单词，即时查阅释义</div>
    </header>

    <div class="search-bar">
      <input
        v-model="query"
        class="search-input"
        placeholder="输入英文单词..."
        @keydown="onInputKey"
        autofocus
      />
      <button class="search-btn" @click="search" :disabled="searching || !query.trim()">查</button>
    </div>

    <div v-if="searching" class="state-center">查找中…</div>
    <div v-else-if="notFound" class="empty">
      <div class="empty-icon">🔍</div>
      <div class="empty-text">未找到「{{ query }}」</div>
      <div class="empty-hint">仅支持英文单词查询</div>
    </div>
    <div v-else-if="result" class="result">
      <div class="result-head">
        <div class="result-word">{{ result.word }}</div>
        <button class="speak-btn" @click="pronounce(result.word)" aria-label="发音">
          <van-icon name="volume-o" size="22" />
        </button>
      </div>
      <div v-if="result.phonetic" class="result-phonetic">{{ result.phonetic }}</div>

      <ul class="result-translations">
        <li v-for="(t, i) in result.translations" :key="i">
          <span v-if="t.pos" class="pos">{{ t.pos }}</span>
          <span>{{ t.meaning }}</span>
        </li>
      </ul>

      <div v-if="result.tag" class="result-tags">
        <span
          v-for="tag in result.tag.split(' ').filter(Boolean)"
          :key="tag"
          class="tag-badge"
        >{{ tag }}</span>
      </div>

      <div v-if="result.bnc || result.frq" class="result-freq">
        <span v-if="result.bnc">BNC #{{ result.bnc }}</span>
        <span v-if="result.frq">COCA #{{ result.frq }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lookup {
  min-height: 100vh;
  background: var(--el-bg-page);
}
.page-hero {
  background: var(--el-hero-grad);
  color: #fff;
  padding: calc(env(safe-area-inset-top) + var(--el-space-6)) var(--el-space-4) var(--el-space-6);
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
.search-bar {
  display: flex;
  gap: var(--el-space-2);
  padding: var(--el-space-4);
}
.search-input {
  flex: 1;
  border: 1px solid var(--el-border-default);
  border-radius: var(--el-radius-md);
  padding: 12px 14px;
  font-size: 16px;
  background: var(--el-bg-card);
  outline: none;
  box-sizing: border-box;
}
.search-input:focus {
  border-color: var(--el-primary-500);
}
.search-btn {
  background: var(--el-hero-grad);
  color: #fff;
  border: none;
  border-radius: var(--el-radius-md);
  padding: 0 20px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.search-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.state-center {
  text-align: center;
  color: var(--el-text-tertiary);
  padding: var(--el-space-10) 0;
}
.empty {
  text-align: center;
  padding: var(--el-space-10) 0;
  color: var(--el-text-tertiary);
}
.empty-icon {
  font-size: 40px;
  margin-bottom: var(--el-space-3);
}
.empty-text {
  font-size: 15px;
  color: var(--el-text-primary);
}
.empty-hint {
  font-size: 13px;
  margin-top: 4px;
}
.result {
  padding: 0 var(--el-space-4);
}
.result-head {
  display: flex;
  align-items: center;
  gap: var(--el-space-3);
}
.result-word {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-primary);
}
.speak-btn {
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
.speak-btn:active {
  background: var(--el-primary-50);
}
.result-phonetic {
  font-size: 15px;
  color: var(--el-text-tertiary);
  margin-top: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.result-translations {
  list-style: none;
  padding: 0;
  margin: var(--el-space-4) 0 0;
}
.result-translations li {
  font-size: 16px;
  color: var(--el-text-primary);
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-light);
  line-height: 1.5;
}
.result-translations li:last-child {
  border-bottom: none;
}
.pos {
  display: inline-block;
  color: var(--el-primary-500);
  background: var(--el-primary-50);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  margin-right: 6px;
  font-weight: 500;
}
.result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: var(--el-space-3);
}
.tag-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--el-bg-soft);
  color: var(--el-text-secondary);
  border: 1px solid var(--el-border-light);
}
.result-freq {
  display: flex;
  gap: var(--el-space-4);
  margin-top: var(--el-space-3);
  font-size: 12px;
  color: var(--el-text-tertiary);
}
</style>
