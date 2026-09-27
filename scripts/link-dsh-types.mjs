#!/usr/bin/env node
/**
 * 为「从源码构建」准备 DSH 类型包。
 *
 * 背景：`@deepseek-ai/dsh-*`、`@deepseek-ai/cordis`、`@deepseek-ai/schemastery`
 * 等包**不在 npm registry 上**，它们随 DeepSeek Harness 本体一起安装。因此
 * 从源码构建本插件时，需要把本机 DSH 安装里的这些包链接到项目的 node_modules。
 *
 * 用法：
 *   node scripts/link-dsh-types.mjs              # 自动探测 DSH 安装
 *   DSH_INSTALL=/path/to/@deepseek-ai/dsh node scripts/link-dsh-types.mjs
 *   node scripts/link-dsh-types.mjs --dsh /path/to/@deepseek-ai/dsh
 *
 * 幂等：已存在（真实目录或正确软链）则跳过；`--force` 可强制重建软链。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const explicit = (() => {
  const i = args.indexOf('--dsh');
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return process.env.DSH_INSTALL || '';
})();

/** 尝试若干候选路径，找到真正的 DSH 安装目录（含 package.json 且 name 为 @deepseek-ai/dsh）。 */
function looksLikeDshInstall(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return typeof pkg.name === 'string' && pkg.name.includes('dsh');
  } catch {
    return false;
  }
}

function candidates() {
  const out = [];
  if (explicit) out.push(explicit);
  // 1) 由 `dsh` 可执行文件反推：<install>/lib/bin.js
  try {
    const bin = execFileSync('command', ['-v', 'dsh'], { shell: true, encoding: 'utf8' }).trim();
    if (bin) {
      const real = fs.realpathSync(bin);
      out.push(path.resolve(path.dirname(real), '..'));
      out.push(path.resolve(path.dirname(real), '../..'));
    }
  } catch {
    /* dsh 不在 PATH */
  }
  // 2) 全局 npm root
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    out.push(path.join(root, '@deepseek-ai', 'dsh'));
    out.push(path.join(root, 'dsh'));
  } catch {
    /* 无 npm */
  }
  // 3) 常见位置
  out.push('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh');
  out.push('/usr/local/lib/node_modules/@deepseek-ai/dsh');
  out.push('/usr/lib/node_modules/@deepseek-ai/dsh');
  return out;
}

function findInstall() {
  for (const dir of candidates()) {
    if (!dir) continue;
    // 直接命中安装根
    if (looksLikeDshInstall(dir)) return fs.realpathSync(dir);
    // 也可能是 node_modules 根（里面含 @deepseek-ai/dsh）
    const nested = path.join(dir, 'node_modules', '@deepseek-ai', 'dsh');
    if (looksLikeDshInstall(nested)) return fs.realpathSync(nested);
  }
  return undefined;
}

const install = findInstall();
if (!install) {
  console.error(
    [
      '未能定位 DeepSeek Harness 安装目录。',
      '请手动指定，例如：',
      '  DSH_INSTALL=/opt/homebrew/lib/node_modules/@deepseek-ai/dsh node scripts/link-dsh-types.mjs',
    ].join('\n'),
  );
  process.exit(1);
}

// DSH 各包互相依赖，统一从安装内的 scoped 目录链接
const scopeDir = path.join(install, 'node_modules', '@deepseek-ai');
if (!fs.existsSync(scopeDir)) {
  console.error(`在 ${scopeDir} 找不到 @deepseek-ai 包目录（DSH 安装结构异常）。`);
  process.exit(1);
}

const targetScope = path.join(projectRoot, 'node_modules', '@deepseek-ai');
fs.mkdirSync(targetScope, { recursive: true });

let linked = 0;
let skipped = 0;
for (const name of fs.readdirSync(scopeDir)) {
  const source = path.join(scopeDir, name);
  const target = path.join(targetScope, name);
  let exists = false;
  try {
    exists = fs.lstatSync(target).isSymbolicLink() || fs.existsSync(target);
  } catch {
    exists = false;
  }
  if (exists && !force) {
    skipped += 1;
    continue;
  }
  if (exists && force) fs.rmSync(target, { recursive: true, force: true });
  fs.symlinkSync(source, target, 'dir');
  linked += 1;
}

// schemastery 在 DSH 安装里可能位于 scope 外
for (const name of ['schemastery', 'cosmokit']) {
  const source = path.join(install, 'node_modules', name);
  const target = path.join(projectRoot, 'node_modules', name);
  if (!fs.existsSync(source)) continue;
  try {
    if (fs.existsSync(target) && !force) {
      skipped += 1;
      continue;
    }
    if (force) fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(source, target, 'dir');
    linked += 1;
  } catch {
    /* 忽略 */
  }
}

console.log(`DSH 安装：${install}`);
console.log(`@deepseek-ai 包：新建链接 ${linked} 个，跳过 ${skipped} 个。`);
console.log('现在可以运行：npm run build');
