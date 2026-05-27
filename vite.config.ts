import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from '@vant/auto-import-resolver';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: process.env.CAPACITOR ? '/' : '/english-learner/',
  plugins: [
    vue(),
    Components({ resolvers: [VantResolver()] }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'English Learner',
        short_name: 'EnglishLearner',
        description: '成人英语背单词 App（移动端 PWA）',
        theme_color: '#1989fa',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/english-learner/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // app shell：HTML/JS/CSS/字体/图标都预缓存。注意 *不* 包含 db/wasm（避免 SW install 时拉 7MB 字典，影响首屏）
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // SW precache 单文件上限（默认 2MB），保护用以防有人误把字典加进 globPatterns
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Free Dictionary API：网络优先，回退缓存（24h 有效）
            urlPattern: /^https:\/\/api\.dictionaryapi\.dev\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dict-api',
              expiration: { maxEntries: 5000, maxAgeSeconds: 86400 },
            },
          },
          {
            // mp3 音频：缓存优先（音频极少变）
            urlPattern: /\.(mp3|ogg|wav)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-files',
              expiration: { maxEntries: 2000, maxAgeSeconds: 30 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 有道 TTS：URL 是 /dictvoice?audio=word&type=2，没有 .mp3 后缀
            urlPattern: /^https:\/\/dict\.youdao\.com\/dictvoice/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'youdao-tts',
              expiration: { maxEntries: 5000, maxAgeSeconds: 90 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 本地 ECDICT 字典：CacheFirst，长效缓存。db 实际还会被 localDict.ts 复制到 IndexedDB，
            // 这里加 SW 缓存是双保险（清浏览器数据后再访问也能离线用）
            urlPattern: /\/dict\/.+\.(db|wasm)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ecdict-asset',
              expiration: { maxEntries: 4, maxAgeSeconds: 365 * 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
