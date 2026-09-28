#!/usr/bin/env node
/**
 * 跨平台 Android 构建入口：Windows 走 gradlew.bat，类 Unix 走 gradlew。
 * 用法：node scripts/build-android.js [gradle 任务…]（默认 assembleDebug）
 *
 * 为什么单独一个脚本：package.json 里写死 `cd android && gradlew.bat assembleDebug` 只能在 Windows 跑，
 * 而 `./gradlew` 在 Windows 的 cmd / PowerShell 里又不能直接执行（会被当成文件打开）——
 * 这里按平台挑启动器，并原样透传退出码，CI 与换机都不会卡在平台差异上。
 *
 * 前置条件：JDK 21（Capacitor 7 的 capacitor.build.gradle 声明 VERSION_21；
 * 本机 JAVA_HOME 若是 JDK 11，由 android/gradle.properties 的 org.gradle.java.home 指定 JDK 21）。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const androidDir = path.resolve(__dirname, '..', 'android');
const isWin = process.platform === 'win32';
const launcher = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');

if (!fs.existsSync(launcher)) {
  console.error('[build:android] 找不到 Gradle 启动器：' + launcher);
  process.exit(1);
}

const tasks = process.argv.slice(2);
if (!tasks.length) tasks.push('assembleDebug');

const r = spawnSync(launcher, tasks, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,   // Windows：交给 cmd.exe 执行 .bat；类 Unix：直接执行（gradlew 自带可执行位）
});

if (r.error) {
  console.error('[build:android] 无法启动 Gradle：' + r.error.message);
  process.exit(1);
}
process.exit(typeof r.status === 'number' ? r.status : 1);
