# 鸦落谷 · 拓荒领主

单机文字策略养成游戏。王历三百一十七年春，你带着一枚擦亮的家徽走进这座山谷，
接手半塌的庄园和五十个不肯看你的村民。

网页版：https://djjdjd23.github.io/yaluogu/

---

## 为什么打包成 APK，而不是 TapTap 小游戏

TapTap 小游戏的运行时**没有 DOM**（只有 `tap.createCanvas()`），而本作的界面是纯 DOM 实现
（约 1 万行 HTML/CSS/JS，含 CSS Grid 布局、`overflow-y` 滚动、中文自动排版）。
走小游戏通道等于把 UI 层整个重写一遍，还要额外做小游戏前置备案。

而 APK 里跑的是 WebView，**DOM 完整可用**，现有代码一行都不用改。
所以本作走 **Android APK + TapPlay** 路线：

| | 小游戏通道 | APK + TapPlay（本方案） |
|---|---|---|
| UI 改动 | 全部重写为 canvas | 零改动 |
| 防沉迷 | 需自行接入并录制证明视频 | TapPlay 已内置，勾选授权即可 |
| 版号 | 需要 | 不需要（走「开放试玩」） |
| 软著 | 需要 | 不需要 |
| 玩家进入 | 点击即玩 | 点击即玩（TapPlay 沙盒免安装） |

---

## 技术方案

```
index.html          ← 游戏本体（单文件，零外部依赖）
    ↓  scripts/build-web.mjs 注入移动端补丁
www/index.html      ← 构建产物
    ↓  Capacitor 打包
android/            ← 原生壳工程
    ↓  GitHub Actions
APK
```

构建时向 `index.html` 注入的补丁（**不改源文件**）：

- Android 返回键：先关弹层 → 再关侧栏 → 都没有则「再按一次退出」
- 状态栏配色贴合游戏深色背景
- `touch-action: manipulation`，去掉双击缩放的 300ms 点击延迟

---

## 本地开发

```bash
npm install
npm run build:web      # 生成 www/
npm run sync           # 生成 www/ 并同步到 Android 工程
```

需要 Node 18+。要本地编译 APK 还需 JDK 17 与 Android SDK；
**推荐直接用下面的云端构建，本地什么都不用装。**

---

## 构建 APK（云端，推荐）

推送到 `main` 分支即自动构建，或在 GitHub 网页的 Actions 页面手动触发。

产物位置：仓库 → Actions → 最近一次运行 → 页面底部 **Artifacts** → `yaluogu-apk`

### 首次构建后必做：固定签名

第一次构建没有配置密钥，工作流会自动生成一个临时 keystore，
同时产出 `keystore-backup` 附件。**必须做这一步，否则下个版本签名不同，TapTap 无法覆盖更新。**

1. 下载 `keystore-backup`，得到 `yaluogu-keystore.b64`
2. 打开仓库 Settings → Secrets and variables → Actions → New repository secret
3. 添加以下三个：

| Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `yaluogu-keystore.b64` 的完整内容（一行） |
| `ANDROID_KEYSTORE_PASSWORD` | `yaluogu2026`（或你改过的密码） |
| `ANDROID_KEY_ALIAS` | `yaluogu` |

配置好之后再次触发构建，就会用固定签名，以后每个版本都能覆盖升级。

> 本地自己生成密钥也可以：
> `keytool -genkeypair -keystore release.keystore -alias yaluogu -keyalg RSA -keysize 2048 -validity 10000`

---

## 发版要改的地方

改 `android/app/build.gradle`：

```gradle
versionCode 1        // 每次发版 +1，必须大于线上版本
versionName "1.0"    // 展示给玩家的版本号
```

---

## 目录结构

```
index.html                      游戏源文件（网页版仍在用，勿删）
鸦落谷.html                     GitHub Pages 的历史副本，与 index.html 相同
scripts/build-web.mjs           构建：生成 www/ 并注入壳补丁
scripts/capture-shots.mjs       自动跑一遍游戏，产出商店截图
android/                        Capacitor 原生工程
.github/workflows/build-apk.yml 云端构建
store-assets/                   上架物料（图标 + 截图）
上架清单.md                     逐项对照 TapTap 后台要填什么
```

---

## 已知注意事项

1. **游戏名正式上线后不可更改**。后台当前是占位名「削妹妹的游戏1」，
   上传包体前必须先改成正式名称。
2. **图标不可自行切圆角**，必须是方图、不能白底/黑底/透明底。`store-assets/游戏图标-512.png` 已按此规范生成。
3. **TapPlay 存档**：游戏存档写在 WebView 的 localStorage 里。
   TapPlay 沙箱是否持久保留这份数据，需要在 TapPlay 测试环境里实测确认
   （进游戏存档 → 完全退出 → 重新进入 → 是否读得到）。
   若发现丢失，改用 `@capacitor/preferences` 落地到 SharedPreferences。
