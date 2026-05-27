import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { ensureBuiltinSeeds } from './data/seed';
import { registerSW } from 'virtual:pwa-register';
import { settingsRepo } from './data/repositories/settingsRepo';
import { startReminder } from './platform/reminder';

import './styles/tokens.css';

async function bootstrap() {
  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.mount('#app');

  // 加载内置词书（ECDICT 首次 ~7s，缓存后 ~1-2s），不阻塞首屏渲染
  await ensureBuiltinSeeds();

  // 启动学习提醒（前台轻量定时器，详见 platform/reminder.ts）
  const s = await settingsRepo.get();
  startReminder(s.reminderTime);

  if (import.meta.env.PROD) {
    registerSW({ immediate: true });
  }
}

void bootstrap();
