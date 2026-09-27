/**
 * 运行环境自动发现（安装即用，替代让用户手改 YAML）。
 *
 * 需求（用户原话等价物）：
 *  - 在用户主目录下的 `llama.cpp` 中搜索 `build/`、`build/bin/`、
 *    `build/bin/release/` 里的 `llama.exe` / 旧版 `llama-server.exe`
 *    （同时覆盖 macOS/Linux 的 `llama-server`、`llama`、`server`、`main`）；
 *  - 同时扫描 PATH；
 *  - 猜测模型目录（`~/llama.cpp/models`、`~/models`、可执行文件同级的 models
 *    等），并统计其中可用的 .gguf 数量（排除 mmproj 与 vocab-only）。
 *
 * 结果只作为 settings 的 **base 层**（= 插件自带的组合默认值）：
 * 用户在 DSH 设置界面里的保存值（user 层）永远优先；用户清空即回落到这里。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_MMPROJ_SUFFIX } from '../shared.js';
import { pairProjectorsByPrefix } from './model-store.js';

export interface ExecutableCandidate {
  /** 绝对路径。 */
  path: string;
  /** 发现来源（目录标签或 PATH）。 */
  source: string;
}

export interface ModelsDirCandidate {
  dir: string;
  /** 该目录下可用模型数量（已排除 mmproj / vocab-only）。 */
  ggufCount: number;
}

export interface ProjectorBinding {
  /** 投影器文件名。 */
  file: string;
  /** 已配对到的模型 id；未配对时缺省。 */
  modelId?: string;
}

export interface DiscoveryReport {
  executables: ExecutableCandidate[];
  modelsDirs: ModelsDirCandidate[];
  /** 可用模型 id（已排除 mmproj 与 vocab-only）。 */
  models: string[];
  /** 目录内视觉投影文件及其配对情况（供设置页手动绑定）。 */
  projectors: ProjectorBinding[];
  updatedAt: string;
}

export function emptyReport(): DiscoveryReport {
  return {
    executables: [],
    modelsDirs: [],
    models: [],
    projectors: [],
    updatedAt: new Date().toISOString(),
  };
}

/** 可执行文件名（按“能起服务”的优先级排序；.exe 覆盖 Windows 命名）。 */
const EXE_NAMES = [
  'llama-server',
  'llama-server.exe',
  'server.exe',
  'server',
  'llama.exe',
  'llama',
  'main.exe',
  'main',
];

/** 用户主目录下相对候选目录（覆盖用户要求的 build/、build/bin/、build/bin/release/）。 */
const REL_EXE_DIRS = [
  'llama.cpp/build/bin/release',
  'llama.cpp/build/bin/Release',
  'llama.cpp/build/bin/RelWithDebInfo',
  'llama.cpp/build/bin/Debug',
  'llama.cpp/build/bin',
  'llama.cpp/build/release',
  'llama.cpp/build/Release',
  'llama.cpp/build',
  'llama.cpp/bin',
  'llama.cpp',
];

/** 模型目录候选（相对用户主目录）。 */
const REL_MODEL_DIRS = [
  'llama.cpp/models',
  'models',
  'llama.cpp/build/bin/models',
  'llama.cpp/build/models',
  '.cache/llama.cpp',
];

const MMPROJ_RE = /mmproj/i;
const VOCAB_ONLY_RE = /^ggml-vocab-.*\.gguf$/i;

function isExecutableFile(p: string): boolean {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    // Windows 上不看执行位；POSIX 上要求任一执行位。
    if (process.platform === 'win32') return true;
    return (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** 目录标签：把主目录缩写成 ~ 便于阅读。 */
function label(dir: string, home: string): string {
  return dir.startsWith(home) ? `~${dir.slice(home.length)}` : dir;
}

/** 统计目录内可用模型数（排除 mmproj 与 vocab-only）。 */
function countModels(dir: string): number {
  let n = 0;
  for (const name of safeReaddir(dir)) {
    if (!name.toLowerCase().endsWith('.gguf')) continue;
    if (MMPROJ_RE.test(name) || VOCAB_ONLY_RE.test(name)) continue;
    n += 1;
  }
  return n;
}

/** 执行一次发现（同步文件系统调用，规模很小）。 */
export function discoverEnvironment(home = os.homedir()): DiscoveryReport {
  const executables: ExecutableCandidate[] = [];
  const seen = new Set<string>();
  const exeDirs: string[] = [];

  const addExeDir = (dir: string): void => {
    if (!exeDirs.includes(dir) && fs.existsSync(dir)) exeDirs.push(dir);
  };

  for (const rel of REL_EXE_DIRS) addExeDir(path.join(home, rel));
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    if (entry) addExeDir(entry);
  }

  exeDirs.forEach((dir, dirIndex) => {
    const names = safeReaddir(dir);
    const source = label(dir, home);
    const ordered = [...names].sort((a, b) => {
      const ai = EXE_NAMES.indexOf(a.toLowerCase());
      const bi = EXE_NAMES.indexOf(b.toLowerCase());
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
    });
    for (const name of ordered) {
      if (EXE_NAMES.indexOf(name.toLowerCase()) < 0) continue;
      const full = path.join(dir, name);
      if (!isExecutableFile(full)) continue;
      let key = full;
      try {
        key = fs.realpathSync(full);
      } catch {
        /* 保留原样 */
      }
      if (seen.has(key)) continue;
      seen.add(key);
      executables.push({ path: full, source });
      void dirIndex;
    }
  });

  // 模型目录：主目录候选 + 可执行文件附近的 models/
  const modelDirs: string[] = [];
  const addModelDir = (dir: string): void => {
    if (!modelDirs.includes(dir) && fs.existsSync(dir)) modelDirs.push(dir);
  };
  for (const rel of REL_MODEL_DIRS) addModelDir(path.join(home, rel));
  for (const exe of executables) {
    const dir = path.dirname(exe.path);
    addModelDir(path.join(dir, 'models'));
    addModelDir(path.join(dir, '..', 'models'));
    addModelDir(path.join(dir, '..', '..', 'models'));
  }

  const modelsDirs: ModelsDirCandidate[] = modelDirs
    .map((dir) => ({ dir, ggufCount: countModels(dir) }))
    .sort((a, b) => b.ggufCount - a.ggufCount || a.dir.localeCompare(b.dir));

  // 模型清单与投影器配对情况（供设置页展示/手动绑定）
  const primary = modelsDirs.find((d) => d.ggufCount > 0)?.dir ?? modelsDirs[0]?.dir;
  let models: string[] = [];
  let projectors: ProjectorBinding[] = [];
  if (primary) {
    const entries = safeReaddir(primary);
    models = entries
      .filter(
        (n) =>
          n.toLowerCase().endsWith('.gguf') &&
          !MMPROJ_RE.test(n) &&
          !VOCAB_ONLY_RE.test(n),
      )
      .map((n) => n.slice(0, -'.gguf'.length))
      .sort();
    const projFiles = entries.filter(
      (n) => n.toLowerCase().endsWith('.gguf') && MMPROJ_RE.test(n),
    );
    const paired = pairProjectorsByPrefix(models, projFiles);
    // 反向映射：模型 → 投影器（含后缀式约定）
    const byModel = new Map<string, string>();
    for (const [id, file] of paired) byModel.set(id, file);
    for (const id of models) {
      if (byModel.has(id)) continue;
      const suffixName = `${id}${DEFAULT_MMPROJ_SUFFIX}`;
      if (projFiles.includes(suffixName)) byModel.set(id, suffixName);
    }
    const assigned = new Set(byModel.values());
    projectors = projFiles.map((file) => {
      const hit = [...byModel.entries()].find(([, f]) => f === file);
      return hit ? { file, modelId: hit[0] } : { file };
    });
    void assigned;
  }

  return { executables, modelsDirs, models, projectors, updatedAt: new Date().toISOString() };
}

/** 带超时保护的发现（apply 期间不阻塞主界面启动）。 */
export async function discoverEnvironmentSafe(timeoutMs = 3000): Promise<DiscoveryReport> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => discoverEnvironment()),
      new Promise<DiscoveryReport>((resolve) => {
        timer = setTimeout(() => resolve(emptyReport()), timeoutMs);
      }),
    ]);
  } catch {
    return emptyReport();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 首选可执行文件（服务端优先）。 */
export function bestExecutable(report: DiscoveryReport): string | undefined {
  const preferred = report.executables.find((e) => /llama-server|server\.exe|server$/i.test(e.path));
  return (preferred ?? report.executables[0])?.path;
}

/** 首选模型目录（gguf 数最多者优先，其次 llama.cpp/models）。 */
export function bestModelsDir(report: DiscoveryReport): string | undefined {
  const withModels = report.modelsDirs.filter((d) => d.ggufCount > 0);
  const pick = withModels.find((d) => /llama\.cpp\/models$/i.test(d.dir)) ?? withModels[0];
  if (pick) return pick.dir;
  return report.modelsDirs[0]?.dir;
}
