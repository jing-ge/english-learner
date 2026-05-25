# 成人英语背单词 App 设计文档

- 项目代号：english-learner
- 日期：2026-05-25
- 状态：设计稿（待 writing-plans 阶段细化）

## 1. 产品定位

面向中文成人学习者的"背单词"工具，对标墨墨背单词。专注词汇记忆这一件事做透，通过 SRS（间隔重复）算法帮助用户高效、长期记忆英文词汇。

**目标用户**：覆盖应试导向（CET4/6、考研、雅思托福）、职场提升、通用兴趣三类成人学习者，通过"多词书可选"满足不同目标。

**MVP 边界**：纯背单词功能，不做听说读写、不做社交、不做云同步。

**平台**：移动端 Web（H5）+ Android APK，一套代码两个产物。

## 2. 总体架构

单端单包架构，Vue 代码同时编译为 Web PWA 和 Capacitor 包装的 Android APK。

```
┌──────────────────────────────────────┐
│  UI 层 (Vue 3 + Vant Mobile)         │
├──────────────────────────────────────┤
│  状态层 (Pinia stores)                │
├──────────────────────────────────────┤
│  领域层 (SRS 调度 / 学习会话 / 词库)  │  纯 TS，无框架依赖
├──────────────────────────────────────┤
│  数据访问层 (Dexie / IndexedDB)       │
├──────────────────────────────────────┤
│  平台适配层 (Capacitor 插件 / Web API)│  抹平 Web vs APK 差异
└──────────────────────────────────────┘
        ↕ 仅在需要词义/音频时联网
   ┌─────────────────────────────┐
   │  Free Dictionary API（外部）│
   └─────────────────────────────┘
```

**核心约束**：
- 离线优先：所有学习功能在没有网的情况下全部可用（除首次抓取某词的释义/音频）
- 领域层不依赖 Vue 和 Dexie，纯函数为主，便于单测和未来迁移
- 平台适配层统一抹平 Web 与 APK 的差异，业务代码只 import 这层
- 纯本地存储，无后端、无账号体系，无云同步

## 3. 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 框架 | Vue 3 + `<script setup>` | 移动端 Web 首屏体积小，生态对移动端友好 |
| 构建 | Vite | 开发体验好，构建产物小 |
| 状态 | Pinia | Vue 官方推荐，TS 友好，体积小 |
| UI 库 | Vant 4 | 移动端组件库，按需引入 |
| 路由 | Vue Router 4 | 标配 |
| 本地数据库 | Dexie.js (IndexedDB) | 类 SQL API，复合索引，几万词条无压力 |
| HTTP 客户端 | 原生 fetch + 自封装重试 | 不引重型 axios |
| Android 打包 | Capacitor 6 | 取代 Cordova 的现代标准，原生插件生态完整 |
| 测试 | Vitest + fake-indexeddb + Playwright | 分层覆盖 |
| 类型 | TypeScript（strict） | 全栈强类型 |

## 4. 模块拆分

```
src/
├── views/                    # 路由级页面
│   ├── HomeView.vue          # 今日学习首页（任务卡片）
│   ├── StudyView.vue         # 学习/复习会话主界面（词卡）
│   ├── WordbookView.vue      # 词库浏览 / 选词书 / 自定义词书
│   ├── StatsView.vue         # 学习统计（曲线、热力图）
│   └── SettingsView.vue      # 每日量、提醒、发音口音、数据导入导出
│
├── components/               # 原子/组合组件
│   ├── WordCard.vue          # 词卡（正面词形、背面释义/例句）
│   ├── AnswerBar.vue         # 4 档反馈
│   ├── PlayButton.vue
│   └── ProgressRing.vue
│
├── stores/                   # Pinia
│   ├── session.ts
│   ├── settings.ts
│   └── progress.ts
│
├── domain/                   # 纯 TS、无框架依赖
│   ├── srs/
│   │   ├── sm2.ts            # SM-2 核心算法
│   │   └── scheduler.ts      # 今日学习/复习选卡逻辑
│   ├── session/
│   │   └── studySession.ts   # 学习会话状态机
│   └── wordbook/
│       └── wordbookService.ts
│
├── data/                     # 数据访问层
│   ├── db.ts                 # Dexie 数据库定义 + 迁移
│   ├── repositories/
│   │   ├── wordRepo.ts
│   │   ├── cardRepo.ts
│   │   └── reviewLogRepo.ts
│   └── seed/                 # 内置词库 JSON（按需懒加载）
│       ├── cet4.json
│       ├── kaoyan.json
│       └── ielts-core-3000.json
│
├── platform/                 # 抹平 Web / APK 差异
│   ├── tts.ts                # 统一发音接口
│   ├── audioCache.ts         # mp3 下载 + IndexedDB Blob 缓存
│   ├── dictionary.ts         # Free Dictionary API 客户端 + 重试
│   └── notification.ts       # 学习提醒
│
├── router/
└── main.ts
```

**关键边界**：
- `domain/srs/sm2.ts` 只接收 `(card, grade)` 返回新状态，不读不写数据库
- `domain/session/studySession.ts` 是状态机，UI 只观察状态不关心算法细节
- `platform/*` 模块通过 Capacitor 检测自动选实现

## 5. 数据模型（Dexie / IndexedDB）

### 5.1 表定义

```ts
// 内置词条（不可变，随版本更新）
words: {
  id: string              // 主键，如 "cet4_abandon"
  word: string
  phonetic?: string       // /əˈbændən/
  translations: Translation[]
  examples?: Example[]
  audioUrl?: string
  wordbooks: string[]     // 多对多，['cet4','kaoyan']
  freqRank?: number
}
indexes: word, *wordbooks, freqRank

// 词书元数据
wordbooks: {
  id: string              // 'cet4' / 'ielts' / user-uuid
  name: string
  source: 'builtin' | 'user'
  totalCount: number
  description?: string
}

// 用户的学习卡（每个用户对一个词的状态）
cards: {
  id: string              // = wordId
  wordId: string
  wordbookId: string
  // SM-2 状态
  ease: number            // 默认 2.5，最低 1.3
  interval: number        // 天
  repetitions: number
  dueAt: number           // ms 时间戳
  // 元数据
  state: 'new' | 'learning' | 'review' | 'suspended'
  addedAt: number
  lastReviewedAt?: number
}
indexes: dueAt, state, wordbookId, [state+dueAt]

// 复习日志（统计 + 算法回溯）
reviewLogs: {
  id: ++                  // 自增
  cardId: string
  reviewedAt: number
  grade: 0|1|2|3
  prevInterval: number
  nextInterval: number
  durationMs: number
}
indexes: reviewedAt, cardId

// 用户设置（单行）
settings: {
  id: 1
  dailyNewCount: number       // 默认 20
  dailyReviewCap: number      // 默认 200
  activeWordbookIds: string[]
  ttsAccent: 'us' | 'uk'
  reminderTime?: string       // "20:00"
  theme: 'light' | 'dark' | 'auto'
}

// 音频缓存（Blob 直接存 IndexedDB）
audioCache: {
  url: string             // 主键
  blob: Blob
  cachedAt: number
}
indexes: cachedAt
```

### 5.2 数据模型设计要点

- `words`（只读静态资产）与 `cards`（用户私有可变数据）分离：升级 app 整体替换 `words`，备份只需要 `cards + reviewLogs + settings + 用户自定义 wordbooks`
- 复合索引 `[state+dueAt]` 让"取今天要复习的卡"是一次范围查询
- `reviewLogs` 永久保留：既支持统计图，也为将来切换 FSRS 算法保留拟合数据
- 数据导入导出格式：JSON.gz

## 6. 核心流程

### 6.1 启动流程

```
打开 app
  ↓
Dexie 初始化 / 跑迁移
  ↓
首次启动？
  ├─ 是 → 引导选词书 → 写入 settings.activeWordbookIds
  │       → 把选中词书的 words 注入 cards 表（state='new'）
  └─ 否 → 直接进首页
  ↓
HomeView：
  · 今日新词进度 (X / dailyNewCount)
  · 今日复习进度 (X / 到期数)
  · 一键开始
```

### 6.2 学习/复习会话（核心）

```
HomeView 点击"开始"
  ↓
scheduler.buildTodaySession(settings):
  1. 取 cards where state='review' AND dueAt <= now    → reviews
  2. 取 cards where state='learning'                   → learnings
  3. 取 cards where state='new' LIMIT dailyNewCount    → news（按 freqRank 排序）
  4. 交错混合（先到期复习 → 中间穿插学习中 → 末尾新词）
  ↓
StudyView 状态机：

   [presenting] 显示词形 + 发音按钮
        ↓ 用户点"显示释义"
   [revealed]   显示完整释义、例句、音标
        ↓ 用户选 0/1/2/3 档
   [grading]
        - sm2(card, grade) → newCard
        - 写 cards 表
        - 写 reviewLogs（含 durationMs）
        - 若 grade < 2，把这张卡重新塞回会话队列末尾
        ↓
   [presenting] 下一张
        ↓ 队列空
   [done]       展示本次会话总结
```

**4 档反馈映射**：
| 用户选择 | grade | SM-2 quality |
|---------|-------|-------------|
| 不认识 | 0 | 0 |
| 陌生 | 1 | 2 |
| 模糊 | 2 | 3 |
| 认识 | 3 | 5 |

### 6.3 词义/音频懒加载

```
WordCard 渲染时：
  · 静态 words 表已有 translation/phonetic → 直接显示
  · 缺字段或缺 audioUrl → 后台调 Free Dictionary API
    └─ 成功 → 写回 words 表（覆盖空字段）
    └─ 失败/离线 → 用兜底（系统 TTS、空例句）

点击发音：
  · audioCache 命中 → URL.createObjectURL 播放
  · 未命中 → fetch mp3 → Blob 存 audioCache → 播放
  · 网络失败 → 退化到 platform.tts 系统语音
```

### 6.4 词库切换 / 自定义

- 启用新词书：把该词书未在 `cards` 中的 word 注入为 `state='new'`
- 禁用词书：已学过的卡保留（不丢进度），未学的 `state='new'` 卡删除
- 自定义词书（V1.0 后）：导入 CSV（word,translation 两列），写入 `wordbooks(source='user')` + `words`

## 7. 错误处理与边界

### 7.1 网络

| 场景 | 行为 |
|------|------|
| 词典 API 超时 / 5xx | 指数退避重试 2 次；失败用本地兜底，不阻塞学习 |
| 离线打开 | 完全可用：内置词库基础释义 + 已缓存音频 |
| API 限流（429） | 设备级冷却 5 分钟，期间所有词查询走兜底 |
| mp3 下载失败 | fallback 到 `platform.tts`；不写 audioCache |

### 7.2 数据

| 场景 | 行为 |
|------|------|
| IndexedDB quota 满 | 优先淘汰 30 天未访问的 audioCache；仍满则提示用户清理 |
| Dexie 升级迁移失败 | 弹窗提示 + 自动导出旧库 JSON 让用户保存，再走新库初始化 |
| CSV 导入格式错 | 行级容错：跳过非法行，最后给出"成功 N 条 / 失败 M 条"报告 |
| 卡片状态损坏（NaN ease 等） | 启动时自检：异常值复位为默认值，记录到内部日志 |

### 7.3 SRS 算法边界

| 场景 | 行为 |
|------|------|
| 长期不学几千张卡同日到期 | `dailyReviewCap` 强制截断，多出部分保留到期，按 dueAt 升序 |
| 用户连按 0（全错） | repetitions=0, interval=1, ease 下降但不低于 1.3 |
| 同会话内重复见到同一卡 | 仅在 grade<2 时回插队列末尾，本会话不再写 reviewLogs |

### 7.4 平台差异

| 场景 | 行为 |
|------|------|
| iOS Safari 不支持自动播放 | 首次进学习页让用户点击"开始"激活音频上下文 |
| Android WebView 老版本 | Capacitor 强制现代 WebView；minSdk = 22 |
| 后台被系统杀掉 | 会话状态写 sessionStorage + Pinia persisted，重开自动恢复 |
| 桌面浏览器误访问 | 视口宽度 > 768 时显示"建议移动端使用" |

### 7.5 通知

- Web：`Notification API`，需用户授权
- APK：Capacitor `LocalNotifications`，按 `settings.reminderTime` 定时
- 用户可关闭

## 8. 测试策略

| 层 | 工具 | 覆盖目标 |
|----|------|---------|
| 领域层（纯 TS） | Vitest + table-driven | sm2.ts、scheduler.ts、studySession.ts |
| 数据层 | Vitest + fake-indexeddb | repository CRUD、迁移、复合索引查询 |
| 平台适配层 | mock + 契约测试 | TTS、audioCache、dictionary 接口契约 |
| UI 组件 | Vitest + Vue Test Utils | WordCard、AnswerBar 关键交互 |
| 端到端 | Playwright（仅 Web 端） | "首启选词书 → 学一会话 → 看到统计" smoke |

**测试优先级**：
- 算法和调度的单测必须有——数据正确性的护城河
- 数据迁移测试必须有——升级丢数据是不可恢复事故
- UI 交互靠手动 + smoke E2E，不强求高覆盖

## 9. MVP 范围

**MVP 必须有**：
- 内置 3 本词书：CET4 核心、考研核心、雅思核心 3000
- SM-2 调度的学习/复习会话
- 词义/例句懒加载 + 音频缓存
- 学习设置（每日新词数、复习上限、口音）
- 基础统计（今日完成数、连续打卡天数、累计学会词数）
- Web PWA + Android APK 双产物
- 数据导出/导入（JSON.gz）

**V1.0 后再做（明确推迟）**：
- 学习提醒通知
- 用户自定义词书 CSV 导入
- 学习热力图、复杂统计
- 深色模式
- FSRS 算法切换
- 任何云同步/账号体系
- iOS

## 10. 验收标准

MVP 发布门槛：
1. 算法核心单测全绿，至少包含 SM-2 论文标准用例
2. 在 Chrome / Safari iOS / Android Chrome / 直装 APK 四个环境完成"首启 → 学完一个 20 词会话 → 关闭重开继续"
3. 离线打开后，已学过的词卡能完整展示并发音
4. APK 体积 < 15 MB，Web 首屏 JS < 250 KB（gzip）

## 11. 开放问题（留给 writing-plans 阶段）

- 内置词库 JSON 的具体结构与体积估算（每本词书大约 3000-5500 词）
- Capacitor 插件清单（@capacitor/local-notifications、@capacitor/filesystem 等）选用版本
- PWA Service Worker 缓存策略细节
- 数据导入导出文件版本兼容方案
- 日活跃 0 → 50 时是否需要观测/埋点（默认不做）
