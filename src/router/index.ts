import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { tab: 'home' },
  },
  {
    path: '/study',
    name: 'study',
    component: () => import('@/views/StudyView.vue'),
  },
  {
    path: '/wordbook',
    name: 'wordbook',
    component: () => import('@/views/WordbookView.vue'),
    meta: { tab: 'wordbook' },
  },
  {
    path: '/stats',
    name: 'stats',
    component: () => import('@/views/StatsView.vue'),
    meta: { tab: 'stats' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { tab: 'settings' },
  },
  {
    path: '/wrongbook',
    name: 'wrongbook',
    component: () => import('@/views/WrongBookView.vue'),
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
