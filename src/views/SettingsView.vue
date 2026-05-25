<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  CellGroup,
  Cell,
  Stepper,
  RadioGroup,
  Radio,
  Switch,
  Popup,
  TimePicker,
  showToast,
  showSuccessToast,
  showFailToast,
  showConfirmDialog,
} from 'vant';
import { useSettingsStore } from '@/stores/settings';
import { exportBackupJson, importBackupJson } from '@/domain/backup/exportImport';
import {
  startReminder,
  stopReminder,
  isNotificationSupported,
  requestNotificationPermission,
} from '@/platform/reminder';

const settings = useSettingsStore();
const fileInput = ref<HTMLInputElement | null>(null);
const showTimePicker = ref(false);
const pickerColumns = ref<[string, string]>(['08', '00']);

onMounted(async () => {
  await settings.load();
  if (settings.settings.reminderTime) {
    const [h, m] = settings.settings.reminderTime.split(':');
    pickerColumns.value = [h, m];
  }
});

const dailyNewCount = computed({
  get: () => settings.settings.dailyNewCount,
  set: (v) => void settings.update({ dailyNewCount: clamp(v, 5, 100) }),
});

const dailyReviewCap = computed({
  get: () => settings.settings.dailyReviewCap,
  set: (v) => void settings.update({ dailyReviewCap: clamp(v, 20, 500) }),
});

const ttsAccent = computed({
  get: () => settings.settings.ttsAccent,
  set: (v) =>
    void settings
      .update({ ttsAccent: v as 'us' | 'uk' })
      .then(() => showToast(`已切换到 ${v.toUpperCase()} 发音`)),
});

const reminderEnabled = computed(() => Boolean(settings.settings.reminderTime));
const reminderTimeLabel = computed(() => settings.settings.reminderTime ?? '未设置');

async function toggleReminder(on: boolean) {
  if (!on) {
    await settings.update({ reminderTime: undefined });
    stopReminder();
    showToast('已关闭学习提醒');
    return;
  }
  if (!isNotificationSupported()) {
    showFailToast('当前浏览器不支持通知');
    return;
  }
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') {
    showFailToast('未授予通知权限');
    return;
  }
  // 打开 picker 选时间
  showTimePicker.value = true;
}

function onTimeConfirm(value: { selectedValues: string[] }) {
  const [h, m] = value.selectedValues;
  const t = `${h}:${m}`;
  pickerColumns.value = [h, m];
  void settings.update({ reminderTime: t }).then(() => {
    startReminder(t);
    showSuccessToast(`已设为每天 ${t} 提醒`);
  });
  showTimePicker.value = false;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

async function doExport() {
  const json = await exportBackupJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = `english-learner-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccessToast('备份已导出');
}

function pickImport() {
  fileInput.value?.click();
}

async function onFileChosen(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await showConfirmDialog({
      title: '导入将覆盖现有数据',
      message: '当前的学习记录、设置和自定义词书会被备份文件替换，是否继续？',
    });
  } catch {
    input.value = '';
    return;
  }
  try {
    const text = await file.text();
    const r = await importBackupJson(text);
    showSuccessToast(`导入成功：${r.cards} 张卡，${r.reviewLogs} 条日志`);
    await settings.load();
  } catch (err) {
    showFailToast(`导入失败：${(err as Error).message}`);
  } finally {
    input.value = '';
  }
}
</script>

<template>
  <div class="settings">
    <header class="page-hero">
      <div class="hero-title">我的</div>
      <div class="hero-sub">个性化你的学习节奏</div>
    </header>

    <CellGroup inset class="group" title="学习量">
      <Cell title="每日新词数" :label="`${dailyNewCount} 词 / 天`">
        <template #right-icon>
          <Stepper v-model="dailyNewCount" :min="5" :max="100" :step="5" integer />
        </template>
      </Cell>
      <Cell title="每日复习上限" :label="`${dailyReviewCap} 词 / 天`">
        <template #right-icon>
          <Stepper v-model="dailyReviewCap" :min="20" :max="500" :step="10" integer />
        </template>
      </Cell>
    </CellGroup>

    <CellGroup inset class="group" title="发音">
      <Cell title="口音">
        <template #right-icon>
          <RadioGroup v-model="ttsAccent" direction="horizontal">
            <Radio name="us">美式</Radio>
            <Radio name="uk">英式</Radio>
          </RadioGroup>
        </template>
      </Cell>
    </CellGroup>

    <CellGroup inset class="group" title="提醒">
      <Cell title="每日学习提醒" :label="reminderEnabled ? `每天 ${reminderTimeLabel} · 浏览器开启时生效` : '关闭'">
        <template #right-icon>
          <Switch :model-value="reminderEnabled" @update:model-value="toggleReminder" />
        </template>
      </Cell>
      <Cell
        v-if="reminderEnabled"
        title="提醒时间"
        :value="reminderTimeLabel"
        is-link
        @click="showTimePicker = true"
      />
    </CellGroup>

    <CellGroup inset class="group" title="数据">
      <Cell title="导出备份" is-link @click="doExport" />
      <Cell title="导入备份（覆盖）" is-link @click="pickImport" />
    </CellGroup>

    <input
      ref="fileInput"
      type="file"
      accept="application/json"
      style="display: none"
      @change="onFileChosen"
    />

    <Popup v-model:show="showTimePicker" round position="bottom">
      <TimePicker
        v-model="pickerColumns"
        title="选择提醒时间"
        :columns-type="['hour', 'minute']"
        @confirm="onTimeConfirm"
        @cancel="showTimePicker = false"
      />
    </Popup>
  </div>
</template>

<style scoped>
.settings {
  min-height: 100vh;
  background: var(--el-bg-page);
  padding-bottom: 32px;
}
.page-hero {
  background: var(--el-hero-grad);
  color: #fff;
  padding: calc(env(safe-area-inset-top) + var(--el-space-6)) var(--el-space-4) var(--el-space-6);
  margin-bottom: var(--el-space-2);
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
.group {
  margin-top: var(--el-space-5);
}
:deep(.van-cell-group__title) {
  color: var(--el-text-tertiary);
  font-size: var(--el-font-xs);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding-left: var(--el-space-5);
}
:deep(.van-cell-group--inset) {
  border-radius: var(--el-radius-lg);
  overflow: hidden;
  box-shadow: var(--el-shadow-sm);
}
</style>
