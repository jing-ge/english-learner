<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { showToast, showSuccessToast, showFailToast, showConfirmDialog } from 'vant';
import { wordbookRepo } from '@/data/repositories/wordbookRepo';
import { useSettingsStore } from '@/stores/settings';
import { useProgressStore } from '@/stores/progress';
import { waitForSeeds } from '@/data/seed';
import {
  enableWordbook,
  disableWordbook,
  createUserWordbook,
  deleteUserWordbook,
} from '@/domain/wordbook/wordbookService';
import { parseImportText } from '@/domain/wordbook/parseImport';
import type { WordbookRecord } from '@/data/types';

const settings = useSettingsStore();
const progress = useProgressStore();
const books = ref<WordbookRecord[]>([]);
const loading = ref(true);

const showImport = ref(false);
const importName = ref('');
const importText = ref('');
const importing = ref(false);

const activeSet = computed(() => new Set(settings.settings.activeWordbookIds));
const activeCount = computed(() => settings.settings.activeWordbookIds.length);

const previewParsed = computed(() => parseImportText(importText.value));

onMounted(async () => {
  await waitForSeeds();
  await refresh();
  loading.value = false;
});

async function refresh() {
  await settings.load();
  books.value = await wordbookRepo.listAll();
}

async function toggle(book: WordbookRecord, enabled: boolean) {
  if (enabled) {
    const r = await enableWordbook(book.id);
    showSuccessToast(`已启用《${book.name}》，新增 ${r.added} 个待学`);
    await settings.update({
      activeWordbookIds: Array.from(new Set([...settings.settings.activeWordbookIds, book.id])),
    });
  } else {
    const r = await disableWordbook(book.id);
    showToast(`已禁用《${book.name}》，移除 ${r.removed} 个未学词`);
    await settings.update({
      activeWordbookIds: settings.settings.activeWordbookIds.filter((id) => id !== book.id),
    });
  }
  await progress.refresh();
}

async function doImport() {
  const name = importName.value.trim();
  if (!name) {
    showFailToast('请填写词书名');
    return;
  }
  const { drafts, invalidLines } = previewParsed.value;
  if (drafts.length === 0) {
    showFailToast('没有可导入的词条');
    return;
  }
  importing.value = true;
  try {
    const r = await createUserWordbook(name, drafts);
    showSuccessToast(
      `已创建《${name}》，共 ${r.addedWords} 词${invalidLines.length ? `，${invalidLines.length} 行被跳过` : ''}`,
    );
    importName.value = '';
    importText.value = '';
    showImport.value = false;
    await refresh();
  } catch (err) {
    showFailToast(`导入失败：${(err as Error).message}`);
  } finally {
    importing.value = false;
  }
}

async function onDelete(book: WordbookRecord) {
  try {
    await showConfirmDialog({
      title: `删除《${book.name}》？`,
      message: '该词书下的所有词条与学习记录将被永久删除',
    });
  } catch {
    return;
  }
  try {
    await deleteUserWordbook(book.id);
    if (activeSet.value.has(book.id)) {
      await settings.update({
        activeWordbookIds: settings.settings.activeWordbookIds.filter((id) => id !== book.id),
      });
    }
    showSuccessToast('已删除');
    await refresh();
    await progress.refresh();
  } catch (err) {
    showFailToast((err as Error).message);
  }
}

function coverClass(idx: number): string {
  return `cover-${(idx % 6) + 1}`;
}
function initials(name: string): string {
  const ascii = name.match(/[A-Za-z0-9]+/);
  if (ascii) return ascii[0].slice(0, 4).toUpperCase();
  return name.slice(0, 2);
}
</script>

<template>
  <div class="wordbook">
    <header class="page-hero">
      <div class="hero-title">
        词库
        <button class="hero-add" @click="showImport = true">+ 自建</button>
      </div>
      <div class="hero-sub">
        已启用 {{ activeCount }} 本 · 共 {{ books.length }} 本可选
      </div>
    </header>

    <div class="grid">
      <div
        v-for="(book, idx) in books"
        :key="book.id"
        class="book"
        :class="{ active: activeSet.has(book.id) }"
      >
        <div class="cover" :class="coverClass(idx)">
          <span class="cover-text">{{ initials(book.name) }}</span>
          <span class="cover-count">{{ book.totalCount }} 词</span>
        </div>
        <div class="book-info">
          <div class="book-name">
            {{ book.name }}
            <span v-if="book.source === 'user'" class="user-tag">自建</span>
          </div>
          <div class="book-desc">{{ book.description || '内置词书' }}</div>
        </div>
        <div class="book-actions">
          <van-switch
            :model-value="activeSet.has(book.id)"
            @update:model-value="(v: boolean) => toggle(book, v)"
          />
          <button
            v-if="book.source === 'user'"
            class="del-btn"
            @click="onDelete(book)"
            aria-label="删除"
          >🗑</button>
        </div>
      </div>

      <div v-if="!loading && books.length === 0" class="empty">
        <div class="empty-icon">📂</div>
        <div class="empty-text">暂无词书</div>
      </div>
    </div>

    <!-- 导入弹窗 -->
    <van-popup v-model:show="showImport" round position="bottom" :style="{ height: '80vh' }">
      <div class="imp">
        <div class="imp-head">
          <div class="imp-title">自建词书</div>
          <button class="imp-close" @click="showImport = false">×</button>
        </div>
        <div class="imp-form">
          <input
            v-model="importName"
            class="imp-name"
            placeholder="词书名（如：托福核心 100）"
            maxlength="40"
          />
          <textarea
            v-model="importText"
            class="imp-text"
            placeholder="每行一个：&#10;abandon&#10;ability,n. 能力&#10;serendipity,机缘巧合,/ˌserənˈdɪpəti/&#10;&#10;支持纯单词列表 或 word,中文释义[,音标]"
            rows="10"
          ></textarea>
          <div class="imp-hint">
            <span>{{ previewParsed.drafts.length }} 个有效词</span>
            <span v-if="previewParsed.invalidLines.length" class="imp-hint-warn">
              · {{ previewParsed.invalidLines.length }} 行无效将被跳过
            </span>
          </div>
        </div>
        <div class="imp-foot">
          <van-button block round type="primary" :loading="importing" :disabled="!previewParsed.drafts.length || !importName.trim()" @click="doImport">
            创建并保存
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.wordbook {
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
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hero-add {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.hero-add:active {
  background: rgba(255, 255, 255, 0.3);
}
.hero-sub {
  margin-top: 4px;
  font-size: 13px;
  opacity: 0.9;
}
.grid {
  padding: var(--el-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--el-space-3);
}
.book {
  display: flex;
  align-items: center;
  gap: var(--el-space-3);
  background: var(--el-bg-card);
  border-radius: var(--el-radius-lg);
  padding: var(--el-space-3);
  box-shadow: var(--el-shadow-sm);
  border: 2px solid transparent;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.book.active {
  border-color: var(--el-primary-300);
  box-shadow: var(--el-shadow-md);
}
.cover {
  width: 60px;
  height: 76px;
  border-radius: var(--el-radius-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: var(--el-shadow-sm);
}
.cover-text {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.cover-count {
  font-size: 10px;
  opacity: 0.85;
  margin-top: 4px;
}
.cover-1 { background: var(--el-cover-1); }
.cover-2 { background: var(--el-cover-2); }
.cover-3 { background: var(--el-cover-3); }
.cover-4 { background: var(--el-cover-4); }
.cover-5 { background: var(--el-cover-5); }
.cover-6 { background: var(--el-cover-6); }

.book-info {
  flex: 1;
  min-width: 0;
}
.book-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-primary);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.user-tag {
  font-size: 10px;
  font-weight: 500;
  color: var(--el-purple-500);
  background: #f3e8ff;
  border-radius: 4px;
  padding: 1px 6px;
}
.book-desc {
  font-size: 13px;
  color: var(--el-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.book-actions {
  display: flex;
  align-items: center;
  gap: var(--el-space-2);
}
.del-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--el-text-tertiary);
  font-size: 16px;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background 0.15s ease;
}
.del-btn:active {
  background: var(--el-bg-soft);
}
.empty {
  text-align: center;
  padding: var(--el-space-10) 0;
  color: var(--el-text-tertiary);
}
.empty-icon {
  font-size: 48px;
  margin-bottom: var(--el-space-2);
}
.empty-text {
  font-size: 14px;
}

/* 导入弹窗 */
.imp {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-page);
}
.imp-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--el-space-4) var(--el-space-4) var(--el-space-3);
  background: var(--el-bg-card);
}
.imp-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--el-text-primary);
}
.imp-close {
  background: transparent;
  border: none;
  font-size: 28px;
  line-height: 1;
  color: var(--el-text-tertiary);
  cursor: pointer;
}
.imp-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--el-space-3);
  padding: var(--el-space-4);
  overflow-y: auto;
}
.imp-name {
  width: 100%;
  border: 1px solid var(--el-border-default);
  border-radius: var(--el-radius-md);
  padding: 12px 14px;
  font-size: 15px;
  background: var(--el-bg-card);
  outline: none;
  box-sizing: border-box;
}
.imp-name:focus {
  border-color: var(--el-primary-500);
}
.imp-text {
  width: 100%;
  border: 1px solid var(--el-border-default);
  border-radius: var(--el-radius-md);
  padding: 12px 14px;
  font-family:
    ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    'Liberation Mono',
    'Courier New',
    monospace;
  font-size: 13px;
  background: var(--el-bg-card);
  outline: none;
  resize: vertical;
  min-height: 200px;
  box-sizing: border-box;
  line-height: 1.6;
}
.imp-text:focus {
  border-color: var(--el-primary-500);
}
.imp-hint {
  font-size: 12px;
  color: var(--el-text-tertiary);
}
.imp-hint-warn {
  color: var(--el-warning-500);
}
.imp-foot {
  padding: var(--el-space-3) var(--el-space-4) calc(env(safe-area-inset-bottom) + var(--el-space-3));
  background: var(--el-bg-card);
  border-top: 1px solid var(--el-border-light);
}
</style>