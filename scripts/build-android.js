#!/usr/bin/env node
/**
 * 跨平台 Android 构建入口：Windows 走 gradlew.bat，类 Unix 走 gradlew。
 * 用法：node scripts/build-android.js [--print-java] [gradle 任务…]（默认 assembleDebug）
 *
 * 为什么单独一个脚本：package.json 里写死 `cd android && gradlew.bat assembleDebug` 只能在 Windows 跑，
 * 而 `./gradlew` 在 Windows 的 cmd / PowerShell 里又不能直接执行（会被当成文件打开）——
 * 这里按平台挑启动器，并原样透传退出码，CI 与换机都不会卡在平台差异上。
 *
 * 前置条件：JDK 21（Capacitor 7 的 capacitor.build.gradle 声明 VERSION_21）。
 * 本脚本自己探测 JDK 21 并用 -Dorg.gradle.java.home=<path> 传给 Gradle：
 * 既不必依赖 PATH 里的 java（它很可能是 JDK 11/17），也不必在 android/gradle.properties 里
 * 写死某一台机器的绝对路径（写死之后换机器 / 上 CI 必挂）。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const androidDir = path.resolve(__dirname, '..', 'android');
const isWin = process.platform === 'win32';
const launcher = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');

/* ---------- JDK 探测 ----------
   为什么不用 execSync('java -version')：那只是问 PATH，而 PATH 上的 java 完全可能是 JDK 11/17
   （android/gradle.properties 当年就是为此才写死路径的），问到的版本号与实际要用的 JDK 无关。
   做法：直接看候选目录下有没有 bin/java(.exe)，再用 -version 复核主版本，确认真的是 21。 */
const JAVA_BIN = isWin ? 'java.exe' : 'java';
const VERSION_RE = /version "(\d+)/;   // java -version 把版本打到 stderr：openjdk version "21.0.1" 2023-10-17

/** 候选目录的主版本号；目录不存在 / 不是 JDK / 执行失败一律返回 null */
function javaMajor(home) {
  const bin = path.join(home, 'bin', JAVA_BIN);
  if (!fs.existsSync(bin)) return null;
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });   // 版本号在 stderr，两个流都收
  const m = VERSION_RE.exec(String(r.stderr || '') + String(r.stdout || ''));
  return m ? Number(m[1]) : null;
}

/** 极简通配展开（只支持 *）：本脚本只需要"某目录下按前缀挑子目录"，为它引 glob 依赖不值得 */
function expandGlob(pattern) {
  const norm = isWin ? pattern.replace(/\//g, '\\') : pattern;
  const base = path.basename(norm);
  if (!base.includes('*')) return fs.existsSync(norm) ? [norm] : [];
  const re = new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', isWin ? 'i' : '');
  try {
    return fs.readdirSync(path.dirname(norm)).filter(n => re.test(n)).sort().map(n => path.join(path.dirname(norm), n));
  } catch (_) { return []; }   // 目录不存在（如 Linux 上不会有 D:\Java）就当没有候选
}

/** 按顺序找 JDK 21：环境变量 → 常见安装路径；返回 { home, from } 或 { home:null, checked:[…] } */
function findJdk21() {
  const tries = [];
  if (process.env.LEARN_APP_JAVA_HOME) tries.push(['LEARN_APP_JAVA_HOME', process.env.LEARN_APP_JAVA_HOME]);
  if (process.env.JAVA_HOME) tries.push(['JAVA_HOME', process.env.JAVA_HOME]);   // 非 21 会在下面被跳过
  const globs = isWin
    ? ['D:/Java/jdk-21*', 'C:/Program Files/Java/jdk-21*', 'C:/Program Files/Eclipse Adoptium/jdk-21*', 'C:/Program Files/Microsoft/jdk-21*']
    : ['/usr/lib/jvm/*21*', '/opt/java/*21*', '/usr/local/lib/jvm/*21*'];
  for (const g of globs) for (const h of expandGlob(g)) tries.push(['常见路径 ' + g, h]);

  const checked = [];
  for (const [from, home] of tries) {
    const major = javaMajor(home);
    if (major === 21) return { home, from };
    checked.push(home + '（来源 ' + from + '；' + (major === null ? '不是可执行的 JDK' : '主版本是 ' + major + '，不是 21') + '）');
  }
  return { home: null, checked };
}

const argv = process.argv.slice(2);
const printJava = argv.includes('--print-java');
const jdk = findJdk21();

if (!jdk.home) {
  console.error('[build:android] 找不到 JDK 21 —— Capacitor 7 的 capacitor.build.gradle 声明了 VERSION_21，用 JDK 11/17 会直接构建失败。');
  console.error('  已尝试的候选：');
  jdk.checked.forEach(c => console.error('    - ' + c));
  console.error('  解决办法（任选其一）：');
  console.error('    1) 设环境变量 LEARN_APP_JAVA_HOME 指向 JDK 21 的 home（优先级最高，例：' + (isWin ? 'D:\\Java\\jdk-21.0.1' : '/usr/lib/jvm/jdk-21') + '）');
  console.error('    2) 把 JAVA_HOME 指向 JDK 21');
  console.error('    3) 把 JDK 21 装到常见位置：' + (isWin ? 'D:/Java/jdk-21* 或 C:/Program Files/Eclipse Adoptium/jdk-21*' : '/usr/lib/jvm/*21*'));
  console.error('  用 Android Studio 构建不需要这些：IDE 用自己的 JDK 与 Gradle 设置。');
  process.exit(1);
}
if (printJava) {
  // 只打印探测结果、不启动 Gradle：换机器或排查构建环境时先用它自查
  console.log('[build:android] JDK home = ' + jdk.home);
  console.log('[build:android] 来源     = ' + jdk.from);
  console.log('[build:android] 版本复核 = java -version 主版本 21 ✓');
  process.exit(0);
}

const tasks = argv.filter(a => a !== '--print-java');
if (!tasks.length) tasks.push('assembleDebug');

if (!fs.existsSync(launcher)) {
  console.error('[build:android] 找不到 Gradle 启动器：' + launcher);
  process.exit(1);
}

/* -Dorg.gradle.java.home 必须排在任务名之前：Gradle 只解析自己之前的命令行 -D。
   Windows：.bat 必须经 cmd.exe（shell:true），而 shell:true 时 Node 只是把参数用空格拼起来 ——
   路径或参数里的空格会被二次分词（旧实现踩的就是这个坑）。这里自己拼命令行：
   只给"含空格 / cmd 元字符"的 token 加引号，所以无空格的常见情形与 Node 默认拼法一致（不引入新行为）；
   含空格时按 cmd 规则加引号 + 转义内部 " + 结尾连续反斜杠翻倍。
   类 Unix：shell:false 直接 execve，参数原样进 argv，绝不能加引号（引号会变成参数的一部分）。 */
const gradleArgs = ['-Dorg.gradle.java.home=' + jdk.home].concat(tasks);
const winQuote = (s) => {
  const t = String(s);
  if (!/[\s"&|<>^()%!]/.test(t)) return t;
  return '"' + t.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
};
const r = isWin
  ? spawnSync([launcher].concat(gradleArgs).map(winQuote).join(' '), { cwd: androidDir, stdio: 'inherit', shell: true })
  : spawnSync(launcher, gradleArgs, { cwd: androidDir, stdio: 'inherit' });

if (r.error) {
  console.error('[build:android] 无法启动 Gradle：' + r.error.message);
  process.exit(1);
}
process.exit(typeof r.status === 'number' ? r.status : 1);
