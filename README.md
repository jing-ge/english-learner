# English Learner

无广告、无订阅、可离线的英语背单词 PWA 应用。

## 在线体验

https://jing-ge.github.io/english-learner/

## 功能特性

- **FSRS 间隔重复** — 基于 ts-fsrs v5 算法，四档评分智能调度复习
- **7 本内置词书** — 高考 / CET-4 / 考研 / CET-6 / IELTS / TOEFL / GRE，全部从 ECDICT 派生
- **自建词书** — 支持粘贴导入纯单词列表或 CSV 格式（word,中文释义[,音标]）
- **3D 翻转词卡** — 正面英文，背面中文释义 + 音标 + 词根 + 形态变化 + 例句
- **错题本** — 自动收集窗口期内错词，支持集中刷错
- **统计看板** — 连续打卡、记忆健康度、热力图、到期预报、留存曲线
- **发音三级兜底** — Free Dictionary → 有道 TTS → 浏览器 SpeechSynthesis
- **ECDICT 离线词典** — 内置 5.78 万高频词 SQLite 数据库（WASM 运行）
- **数据备份** — JSON 全量导出 / 导入
- **PWA** — 离线可用，可添加到主屏幕
- **Android 原生** — 通过 Capacitor 打包 APK

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | Vue 3 + TypeScript |
| UI | Vant 4 |
| 状态管理 | Pinia |
| 数据库 | Dexie (IndexedDB) |
| 本地词典 | sql.js (SQLite WASM) |
| 间隔重复 | ts-fsrs (FSRS v5) |
| PWA | vite-plugin-pwa (Workbox) |
| 原生 | Capacitor 8 (Android) |
| 部署 | GitHub Actions → GitHub Pages |

## 项目结构

```
src/
├── views/              # 页面（首页/学习/词库/统计/设置/错词本）
├── components/         # 组件（词卡/评分栏/遗忘曲线）
├── domain/             # 领域逻辑（纯函数，不依赖 UI/DB）
│   ├── srs/            #   FSRS 调度 + SM-2 迁移
│   ├── session/        #   学习会话状态机
│   ├── wordbook/       #   词书启用/禁用/创建
│   ├── wrongbook/      #   错词派生逻辑
│   ├── stats/          #   统计聚合 + 热力图 + 留存曲线
│   ├── text/           #   例句关键词高亮
│   └── backup/         #   数据导出/导入
├── data/               # 数据层
│   ├── db.ts           #   Dexie 数据库定义 + 迁移
│   ├── repositories/   #   CRUD 封装
│   └── seed/           #   内置词书初始化
├── platform/           # 平台适配（词典/TTS/音频缓存/通知）
├── stores/             # Pinia 状态
├── composables/        # 组合式函数
└── styles/             # 全局设计 token
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm test

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## Android 打包

```bash
# 构建前端 + 同步到 Android
npm run build
npx cap sync android

# 打包 debug APK（需要 JDK 21 + Android SDK）
cd android
JAVA_HOME=<JDK_21_PATH> ./gradlew assembleDebug

# APK 产出路径
# android/app/build/outputs/apk/debug/app-debug.apk
```

## 数据来源

- [ECDICT](https://github.com/skywind3000/ECDICT) — 中文释义、音标、形态学、等级标签、词频
- [Free Dictionary API](https://dictionaryapi.dev/) — 英文释义、例句、音频（在线兜底）
- 有道 TTS — 真人发音

## License

MIT
