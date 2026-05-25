<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Tabbar, TabbarItem } from 'vant';

const route = useRoute();
const router = useRouter();

const showTabbar = computed(() => Boolean(route.meta?.tab));
const activeTab = computed<string>(() => (route.meta?.tab as string) ?? '');

function jump(name: string) {
  const map: Record<string, string> = {
    home: 'home',
    wordbook: 'wordbook',
    stats: 'stats',
    settings: 'settings',
  };
  const target = map[name];
  if (!target || route.name === target) return;
  router.push({ name: target });
}
</script>

<template>
  <div class="app-shell">
    <router-view class="app-page" :class="{ 'has-tabbar': showTabbar }" />
    <Tabbar
      v-if="showTabbar"
      :model-value="activeTab"
      active-color="var(--el-primary-500)"
      inactive-color="#9ca3af"
      safe-area-inset-bottom
      route
      @change="jump"
    >
      <TabbarItem name="home" icon="home-o">学习</TabbarItem>
      <TabbarItem name="wordbook" icon="bookmark-o">词库</TabbarItem>
      <TabbarItem name="stats" icon="chart-trending-o">统计</TabbarItem>
      <TabbarItem name="settings" icon="setting-o">我的</TabbarItem>
    </Tabbar>
  </div>
</template>

<style>
.app-shell {
  min-height: 100vh;
}
.app-page.has-tabbar {
  padding-bottom: calc(50px + env(safe-area-inset-bottom));
}
</style>
