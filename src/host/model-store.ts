/**
 * 模型目录存储：扫描/监听 modelsDir，为每个 *.gguf 建立目录项（P0①/P1），
 * 配对同名的 mmproj.gguf（视觉模型），并提供 P2 上下文长度启发式。
 *
 * 只依赖 Node 内置模块 —— host 侧运行于 Node，无需经 ctx.fs。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_MMPROJ_SUFFIX, MODEL_ID_PATTERN } from '../shared.js';

/** 一个可被 DSH 选择的 llama.cpp 模型。 */
export interface DiscoveredModel {
  /** DSH 中使用的模型 id（= gguf 文件基名，去掉扩展名）。 */
  id: string;
  /** 人类可读名（展示用）。 */
  name: string;
  /** gguf 绝对路径。 */
  file: string;
  /** 文件字节数（加载/上下文启发式用）。 */
  size: number;
  /** 同目录下匹配的 mmproj.gguf 绝对路径（视觉模型才有）。 */
  mmproj?: string;
  /** 运行期估算的上下文窗口；空 = 未知（交给默认）。 */
  contextWindow?: number;
}

export interface ModelStoreOptions {
  modelsDir: string;
  mmprojSuffix?: string;
  /** 视觉投影文件手动绑定：{ 模型id: 投影文件名 }（优先级最高）。 */
  mmprojOverrides?: Record<string, string>;
}

/** 展开 ~/ 并将相对路径相对 base 解析为绝对路径。 */
export function resolveModelsDir(dir: string, base = process.cwd()): string {
  const expanded = dir === '~' ? os.homedir() : dir.startsWith('~/') || dir === '~'
    ? path.join(os.homedir(), dir.slice(2))
    : dir;
  return path.resolve(base, expanded);
}

/**
 * 模型目录存储。变更通知通过 subscribe 下发（fs.watch + 防抖重扫）。
 */
export class ModelStore {
  private modelsDirValue: string;
  private suffixValue: string;
  private overridesValue: Record<string, string>;
  private items: DiscoveredModel[] = [];
  private watcher?: fs.FSWatcher;
  private scanTimer?: NodeJS.Timeout;
  /** watcher 兜底重扫定时器（网络盘/FSEvents 漏事件时仍能发现变动）。 */
  private pollTimer?: NodeJS.Timeout;
  /** watcher 缺失时的重试定时器（目录稍后才出现的情况）。 */
  private armTimer?: NodeJS.Timeout;
  /** 上次扫描指纹：目录 mtime + 条目数，用于判断是否需要重扫。 */
  private lastSignature = '';
  private lastScanAt = 0;
  private readonly listeners = new Set<(models: readonly DiscoveredModel[]) => void>();
  private disposed = false;

  constructor(options: ModelStoreOptions) {
    this.modelsDirValue = resolveModelsDir(options.modelsDir || '.');
    this.suffixValue = options.mmprojSuffix ?? DEFAULT_MMPROJ_SUFFIX;
    this.overridesValue = options.mmprojOverrides ?? {};
  }

  get dir(): string {
    return this.modelsDirValue;
  }

  /**
   * 重新指向模型目录/后缀（设置页保存后热生效，无需重启 host）：
   * 关闭旧 watcher、重扫、重新 watch。
   */
  reconfigure(options: {
    modelsDir?: string;
    mmprojSuffix?: string;
    mmprojOverrides?: Record<string, string>;
  }): void {
    if (this.disposed) return;
    if (options.modelsDir !== undefined) {
      this.modelsDirValue = resolveModelsDir(options.modelsDir || '.');
    }
    if (options.mmprojSuffix !== undefined && options.mmprojSuffix !== '') {
      this.suffixValue = options.mmprojSuffix;
    }
    if (options.mmprojOverrides !== undefined) {
      this.overridesValue = options.mmprojOverrides;
    }
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        /* 忽略 */
      }
      this.watcher = undefined;
    }
    void this.refresh()
      .then(() => this.watch())
      .catch((err) => console.warn('[llamacpp-bridge] reconfigure rescan failed:', err));
  }

  /** 当前目录项快照（按 id 排序）。 */
  models(): readonly DiscoveredModel[] {
    return this.items;
  }

  get(id: string): DiscoveredModel | undefined {
    return this.items.find((m) => m.id === id);
  }

  subscribe(fn: (models: readonly DiscoveredModel[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 全量重扫。 */
  async refresh(): Promise<readonly DiscoveredModel[]> {
    this.items = await scanDir(this.modelsDirValue, this.suffixValue, this.overridesValue);
    this.lastScanAt = Date.now();
    this.lastSignature = this.signature();
    this.emit();
    return this.items;
  }

  /** 目录指纹：mtime + 条目数（廉价，用于判断是否需要重扫）。 */
  private signature(): string {
    try {
      const st = fs.statSync(this.modelsDirValue);
      const names = fs.readdirSync(this.modelsDirValue);
      return `${st.mtimeMs}:${names.length}`;
    } catch {
      return 'missing';
    }
  }

  /**
   * 按需重扫：目录指纹变化或距上次扫描超过 maxAgeMs 时重新扫描。
   *
   * 这是「models 文件夹变动未更新」的修复点之一：任何消费者（模型选择器、
   * 本插件面板）在读取目录前调用它，即可拿到最新列表，不必等重启或 fs.watch 事件。
   */
  async refreshIfStale(maxAgeMs = 3000): Promise<readonly DiscoveredModel[]> {
    if (this.disposed) return this.items;
    const fresh = Date.now() - this.lastScanAt < maxAgeMs;
    const sameSignature = this.signature() === this.lastSignature;
    if (fresh && sameSignature) return this.items;
    return this.refresh();
  }

  /** 开始监听目录变化；目录暂不存在时定时重试（稍后创建也能被监听到）。 */
  watch(): void {
    if (this.disposed) return;
    if (!fs.existsSync(this.modelsDirValue)) {
      // 目录还没出现（例如外置盘尚未挂载）：定时重试，别让插件永久失去监听。
      if (!this.armTimer) {
        this.armTimer = setInterval(() => {
          if (this.disposed) return;
          if (fs.existsSync(this.modelsDirValue)) {
            if (this.armTimer) clearInterval(this.armTimer);
            this.armTimer = undefined;
            void this.refresh().then(() => this.watch());
          }
        }, 5000);
      }
      return;
    }
    if (!this.pollTimer) {
      // 兜底：即使 fs.watch 漏事件（网络盘/FSEvents 抖动），也定期按需重扫。
      this.pollTimer = setInterval(() => {
        void this.refreshIfStale(60_000).catch(() => {
          /* 忽略瞬时错误 */
        });
      }, 30_000);
    }
    if (this.watcher) return;
    try {
      this.watcher = fs.watch(this.modelsDirValue, (_event, filename) => {
        if (filename && !String(filename).endsWith('.gguf')) return;
        // 防抖：模型加载/下载常伴随多次写事件
        if (this.scanTimer) clearTimeout(this.scanTimer);
        this.scanTimer = setTimeout(() => {
          void this.refresh().catch((err) => {
            console.warn('[llamacpp-bridge] models rescan failed:', err);
          });
        }, 300);
      });
    } catch (err) {
      // fs.watch 在个别平台/目录上可能失败 —— 退化为不监听，保留手动刷新。
      console.warn('[llamacpp-bridge] model dir watch unavailable:', err);
    }
  }

  private emit(): void {
    const snapshot = this.items;
    for (const fn of [...this.listeners]) {
      try {
        fn(snapshot);
      } catch (err) {
        console.warn('[llamacpp-bridge] model store listener error:', err);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.watcher?.close();
    this.watcher = undefined;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.armTimer) clearInterval(this.armTimer);
    this.pollTimer = undefined;
    this.armTimer = undefined;
    this.listeners.clear();
  }
}

/** vocab-only 测试文件（llama.cpp 仓库自带）不作为模型列出。 */
const VOCAB_ONLY_RE = /^ggml-vocab-.*\.gguf$/i;

/**
 * 投影器文件（`mmproj-*.gguf` 前缀式命名，如 mmproj-gemma4-E4B.gguf）：
 * 它们只能与主模型配对使用，单独列出会被误当成模型（加载必失败）。
 * 约定后缀式（`<模型名>-mmproj.gguf`）已在扫描过滤中排除。
 */
const MMPROJ_PREFIX_RE = /^mmproj[-_]/i;

/** 扫描目录：*.gguf（排除 mmproj 后缀与 vocab-only 文件），并为每个模型配对 mmproj。 */
export async function scanDir(
  dir: string,
  mmprojSuffix: string = DEFAULT_MMPROJ_SUFFIX,
  overrides: Record<string, string> = {},
): Promise<DiscoveredModel[]> {
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    // 目录不存在/不可读 —— 返回空目录（插件仍能加载，配置修正后生效）。
    return [];
  }

  const ggufs = names.filter(
    (n) =>
      n.endsWith('.gguf') &&
      !n.endsWith(mmprojSuffix) &&
      !MMPROJ_PREFIX_RE.test(n) &&
      !VOCAB_ONLY_RE.test(n),
  );
  const byName = new Map(names.map((n) => [n, true]));
  // 所有投影器候选：后缀式（<模型名>-mmproj.gguf）与前缀式（mmproj-*.gguf）
  const projectors = names.filter(
    (n) =>
      n.endsWith('.gguf') && (n.endsWith(mmprojSuffix) || MMPROJ_PREFIX_RE.test(n)),
  );

  const ids = ggufs
    .map((n) => n.slice(0, -'.gguf'.length))
    .filter((id) => MODEL_ID_PATTERN.test(id));
  // 前缀式投影器先做模糊配对（按归一化名字评分），避免漏挂视觉文件。
  const fuzzy = pairProjectorsByPrefix(ids, projectors, mmprojSuffix);

  const out: DiscoveredModel[] = [];
  for (const id of ids.sort()) {
    const file = path.join(dir, `${id}.gguf`);
    // ① 手动指定优先（设置页可把任意 mmproj 绑到某个模型）
    const manual = overrides[id];
    let mmproj =
      manual && byName.has(manual) ? path.join(dir, manual) : undefined;
    // ② 后缀约定（<模型名>-mmproj.gguf）
    if (!mmproj) {
      const suffixName = `${id}${mmprojSuffix}`;
      if (byName.has(suffixName)) mmproj = path.join(dir, suffixName);
    }
    // ③ 前缀式模糊配对兜底（mmproj-*.gguf）
    if (!mmproj) {
      const guess = fuzzy.get(id);
      if (guess) mmproj = path.join(dir, guess);
    }
    let size = 0;
    try {
      size = (await fs.promises.stat(file)).size;
    } catch {
      // 竞争删除等 —— 保留目录项但 size=0
    }
    out.push({
      id,
      name: id,
      file,
      size,
      mmproj,
      contextWindow: undefined,
    });
  }
  return out;
}

/* ---------------- 前缀式 mmproj 的模糊配对 ---------------- */

/** 量化/精度等与“是哪个模型”无关的 token，归一化时剔除。 */
const NOISE_TOKENS = new Set([
  'it',
  'instruct',
  'chat',
  'base',
  'gguf',
  'mmproj',
  'vision',
  'projector',
  'f16',
  'f32',
  'bf16',
  'fp16',
  'fp32',
  'q2k',
  'q3k',
  'q4k',
  'q5k',
  'q6k',
  'q8k',
  'q2ks',
  'q3ks',
  'q4ks',
  'q5ks',
  'q6ks',
  'q8ks',
  'q3km',
  'q4km',
  'q5km',
  'q6km',
  'q8km',
  'q4km',
  'iq4xs',
  'iq4nl',
]);

/**
 * 归一化模型/投影器名：小写、按非字母数字切分、剔除量化与角色 token、
 * 再拼成紧凑串（例如 `gemma-4-E4B-it-Q4_K_M` → `gemma4e4b`）。
 */
function normalizeName(raw: string): string {
  const base = raw.replace(/\.gguf$/i, '').toLowerCase();
  return base
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !NOISE_TOKENS.has(t))
    .join('');
}

/**
 * 把前缀式投影器配到最可能的主模型上。
 *
 * 评分：投影器归一化核心若是模型归一化名的子串（或反之），按核心长度打分
 * （核心越长越具体越可信）。核心为空（如 `mmproj-F32.gguf`）则不配对。
 */
export function pairProjectorsByPrefix(
  modelIds: readonly string[],
  projectorNames: readonly string[],
  mmprojSuffix: string = DEFAULT_MMPROJ_SUFFIX,
): Map<string, string> {
  const result = new Map<string, string>();
  const taken = new Set<string>();

  // 只处理前缀式；后缀式已由精确约定覆盖
  const prefixOnly = projectorNames.filter(
    (n) => MMPROJ_PREFIX_RE.test(n) && !n.endsWith(mmprojSuffix),
  );

  for (const proj of prefixOnly) {
    const core = normalizeName(proj);
    if (core.length < 4) continue; // 信息量不足（如 F32），不猜
    let best: { id: string; score: number } | undefined;
    for (const id of modelIds) {
      const model = normalizeName(id);
      if (!model) continue;
      let score = 0;
      if (model.includes(core)) score = core.length / model.length + core.length * 0.01;
      else if (core.includes(model) && model.length >= 4) score = model.length / core.length + model.length * 0.005;
      if (score > 0 && (!best || score > best.score)) best = { id, score };
    }
    if (best && !taken.has(best.id)) {
      result.set(best.id, proj);
      taken.add(best.id);
    }
  }
  return result;
}

/**
 * P2 上下文启发式：在系统总内存、模型文件大小与是否 GPU offload 之间
 * 挑选“稳妥”的上下文档位。这是经验公式，精确值需按机校准：
 *   - KV 缓存预算 ≈ 可用内存 × 0.5（restart 为进程独占内存时）
 *   - 粗估每 token KV 约 = 模型大小(GB) × 16 MB/GB / 4096 上下文当量
 *     （即按“同权重参数下 4k 上下文≈16MB/G 模型”线性外推，保守取值）。
 */
export function pickContextLength(
  modelSize: number,
  opts: { autoContext: boolean; contextLength: number; gpuLayers: number },
): number | null {
  if (opts.contextLength > 0) return opts.contextLength;
  if (!opts.autoContext) return null; // 不干预 —— 交给 llama.cpp 默认
  const totalGiB = os.totalmem() / 1024 ** 3;
  const freeGiB = os.freemem() / 1024 ** 3;
  const modelGiB = modelSize / 1024 ** 3;
  const offload = opts.gpuLayers !== 0; // -1 或 >0 视为有 GPU offload
  const budgetGiB = Math.max(0, freeGiB * 0.5 - (offload ? modelGiB * 0.2 : modelGiB * 0.95));
  const kvPerTokenGiB = modelGiB > 0 ? Math.max(0.0005, modelGiB / 2048) : 0.001;
  const tokens = Math.floor(budgetGiB / kvPerTokenGiB);
  const ladder = [2048, 4096, 8192, 16384, 32768, 65536, 131072];
  let chosen = 4096;
  for (const step of ladder) {
    if (step <= tokens) chosen = step;
    else break;
  }
  // 保守上限：总内存 < 32GiB 时不超过 32k
  if (totalGiB < 32 && chosen > 32768) chosen = 32768;
  return chosen;
}

/** 列出目录内所有视觉投影文件（后缀式与前缀式）。 */
export async function listProjectors(
  dir: string,
  mmprojSuffix: string = DEFAULT_MMPROJ_SUFFIX,
): Promise<string[]> {
  try {
    const names = await fs.promises.readdir(dir);
    return names.filter(
      (n) => n.endsWith('.gguf') && (n.endsWith(mmprojSuffix) || MMPROJ_PREFIX_RE.test(n)),
    );
  } catch {
    return [];
  }
}
