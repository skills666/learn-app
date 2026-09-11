#!/usr/bin/env node
/**
 * 把根目录的 Web 源文件同步到 www/（Capacitor 的 webDir）。
 *
 * 为什么需要它：根目录和 www/ 各存了一份内容完全相同的 index.html / chest.js / sw.js …
 * 手工双向维护迟早分叉。这里固定单向约定：
 *   根目录 = 唯一源    www/ = 生成产物
 * `npm run cap:sync` 与 `npm run build:android` 都会先执行本脚本，所以只需要改根目录的文件。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEST = path.join(ROOT, 'www');
// 参与打包的静态资源清单（android/app/src/main/assets/public 的内容由 cap sync 负责）
// 已移除 1024 的 icon.png：网页只留 192/512/maskable，App 图标走 android 的 mipmap
const FILES = [
  'index.html', 'chest.js', 'sw.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'img-bg-dark.jpg'
];

/* 版本号一致性校验：index.html 的 SW_VERSION 与 sw.js 的 CACHE 必须同步递增，
   漏改会表现为"页面更新了但离线缓存不刷新"，排查起来很费劲，这里在打包前拦一道。 */
const readVer = (file, re) => (fs.readFileSync(path.join(ROOT, file), 'utf8').match(re) || [])[1];
const swVer = readVer('index.html', /SW_VERSION\s*=\s*'([^']+)'/);
const cacheVer = readVer('sw.js', /CACHE\s*=\s*'learn-v([^']+)'/);
if(!swVer || !cacheVer || swVer !== cacheVer){
  console.error(`版本号不一致：index.html SW_VERSION='${swVer}'，sw.js CACHE='learn-v${cacheVer}'。请两处同步递增后再打包。`);
  process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });
let copied = 0, skipped = 0;
for(const f of FILES){
  const src = path.join(ROOT, f);
  if(!fs.existsSync(src)){ console.warn('  [skip] 缺少源文件：' + f); skipped++; continue; }
  const out = path.join(DEST, f);
  if(fs.existsSync(out) && fs.readFileSync(src).equals(fs.readFileSync(out))){ skipped++; continue; }
  fs.copyFileSync(src, out);
  console.log('  [sync] ' + f);
  copied++;
}
console.log(`www/ 同步完成：更新 ${copied} 个；跳过 ${skipped} 个（内容一致或缺源文件）`);
