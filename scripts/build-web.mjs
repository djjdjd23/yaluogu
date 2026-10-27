/**
 * 把仓库根目录的单文件游戏 index.html 转成 Capacitor 可用的 www/index.html。
 *
 * 原则：不改动源文件 index.html（网页版还得继续用它），
 * 只在构建产物里注入移动端壳需要的一小段 CSS / JS。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'index.html');
const outDir = join(root, 'www');
const out = join(outDir, 'index.html');

if (!existsSync(src)) {
  console.error('[build-web] 找不到 index.html');
  process.exit(1);
}

let html = readFileSync(src, 'utf8');

const SHELL_CSS = `
<style id="shell-patch">
/* ---- 移动端壳补丁（构建时注入，不改源文件） ---- */
html {
  touch-action: manipulation;          /* 去掉双击缩放的 300ms 点击延迟 */
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior: none;
}
body { overscroll-behavior: none; }
/* WebView 里滚动条不该出现 */
::-webkit-scrollbar { width: 0; height: 0; }
</style>
`;

const SHELL_JS = `
<script id="shell-patch-js">
(function () {
  'use strict';

  function hideOverlayIfAny() {
    var ov = document.getElementById('overlay');
    if (!ov || ov.classList.contains('hide')) return false;
    if (window.UI && typeof UI.hideOverlay === 'function') UI.hideOverlay();
    else ov.classList.add('hide');
    return true;
  }

  function closeSideIfOpen() {
    var side = document.getElementById('side');
    if (!side || !side.classList.contains('open')) return false;
    side.classList.remove('open');
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.classList.remove('on');
    return true;
  }

  /* ---- 状态栏：贴合游戏的深色羊皮纸风格 ---- */
  function initStatusBar() {
    var Cap = window.Capacitor;
    if (!Cap || !Cap.Plugins || !Cap.Plugins.StatusBar) return;
    var sb = Cap.Plugins.StatusBar;
    try {
      sb.setOverlaysWebView({ overlay: false });
      sb.setBackgroundColor({ color: '#1c1610' });
      sb.setStyle({ style: 'DARK' });   // DARK = 深色背景 + 浅色图标
    } catch (e) { /* 忽略：部分机型不支持 */ }
  }

  /* ---- Android 返回键 ---- */
  function initBackButton() {
    var Cap = window.Capacitor;
    if (!Cap || !Cap.Plugins || !Cap.Plugins.App) return;

    var lastPress = 0;
    var toastEl = null;

    function toast(msg) {
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.style.cssText =
          'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);' +
          'background:rgba(28,22,16,.92);color:#f2e9da;padding:8px 16px;' +
          'border-radius:4px;font-size:13px;z-index:99999;' +
          'pointer-events:none;transition:opacity .2s;font-family:inherit;';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.style.opacity = '1';
      clearTimeout(toastEl._t);
      toastEl._t = setTimeout(function () { toastEl.style.opacity = '0'; }, 1400);
    }

    Cap.Plugins.App.addListener('backButton', function () {
      if (hideOverlayIfAny()) return;
      if (closeSideIfOpen()) return;

      var now = Date.now();
      if (now - lastPress < 2000) {
        Cap.Plugins.App.exitApp();
      } else {
        lastPress = now;
        toast('再按一次返回键退出');
      }
    });
  }

  /* ---- 前后台切换时提示（切后台不丢档，只是提醒一下） ---- */
  function initLifecycle() {
    var Cap = window.Capacitor;
    if (!Cap || !Cap.Plugins || !Cap.Plugins.App) return;
    Cap.Plugins.App.addListener('appStateChange', function (state) {
      if (!state.isActive) {
        document.dispatchEvent(new Event('shell:pause'));
      }
    });
  }

  function boot() {
    initStatusBar();
    initBackButton();
    initLifecycle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
</script>
`;

if (!html.includes('</head>')) {
  console.error('[build-web] index.html 缺少 </head>，无法注入');
  process.exit(1);
}

html = html.replace('</head>', SHELL_CSS + '</head>');

if (html.includes('</body>')) {
  html = html.replace('</body>', SHELL_JS + '</body>');
} else {
  html += SHELL_JS;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(out, html, 'utf8');

/* 顺带把图标等静态资源复制过去（如果存在） */
const assets = ['icon-512.png', 'splash.png'];
for (const a of assets) {
  const p = join(root, a);
  if (existsSync(p)) copyFileSync(p, join(outDir, a));
}

console.log('[build-web] 已生成 www/index.html，大小 ' + (html.length / 1024).toFixed(1) + ' KB');
