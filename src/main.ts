import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { ensureBuiltinSeeds } from './data/seed';
import { registerSW } from 'virtual:pwa-register';
import { settingsRepo } from './data/repositories/settingsRepo';
import { startReminder } from './platform/reminder';
import { ensureLocalDict } from './platform/localDict';

import 'vant/lib/index.css';
import './styles/tokens.css';

async function bootstrap() {
  await ensureBuiltinSeeds();

  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.mount('#app');

  // 启动学习提醒（前台轻量定时器，详见 platform/reminder.ts）
  const s = await settingsRepo.get();
  startReminder(s.reminderTime);

  // 后台预热本地 ECDICT 字典（首次 ~7MB，缓存到 IndexedDB；失败静默）
  void ensureLocalDict();

  if (import.meta.env.PROD) {
    registerSW({ immediate: true });
  }
}

void bootstrap();
