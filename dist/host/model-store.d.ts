/**
 * 模型目录存储：扫描/监听 modelsDir，为每个 *.gguf 建立目录项（P0①/P1），
 * 配对同名的 mmproj.gguf（视觉模型），并提供 P2 上下文长度启发式。
 *
 * 只依赖 Node 内置模块 —— host 侧运行于 Node，无需经 ctx.fs。
 */
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
export declare function resolveModelsDir(dir: string, base?: string): string;
/**
 * 模型目录存储。变更通知通过 subscribe 下发（fs.watch + 防抖重扫）。
 */
export declare class ModelStore {
    private modelsDirValue;
    private suffixValue;
    private overridesValue;
    private items;
    private watcher?;
    private scanTimer?;
    /** watcher 兜底重扫定时器（网络盘/FSEvents 漏事件时仍能发现变动）。 */
    private pollTimer?;
    /** watcher 缺失时的重试定时器（目录稍后才出现的情况）。 */
    private armTimer?;
    /** 上次扫描指纹：目录 mtime + 条目数，用于判断是否需要重扫。 */
    private lastSignature;
    private lastScanAt;
    private readonly listeners;
    private disposed;
    constructor(options: ModelStoreOptions);
    get dir(): string;
    /**
     * 重新指向模型目录/后缀（设置页保存后热生效，无需重启 host）：
     * 关闭旧 watcher、重扫、重新 watch。
     */
    reconfigure(options: {
        modelsDir?: string;
        mmprojSuffix?: string;
        mmprojOverrides?: Record<string, string>;
    }): void;
    /** 当前目录项快照（按 id 排序）。 */
    models(): readonly DiscoveredModel[];
    get(id: string): DiscoveredModel | undefined;
    subscribe(fn: (models: readonly DiscoveredModel[]) => void): () => void;
    /** 全量重扫。 */
    refresh(): Promise<readonly DiscoveredModel[]>;
    /** 目录指纹：mtime + 条目数（廉价，用于判断是否需要重扫）。 */
    private signature;
    /**
     * 按需重扫：目录指纹变化或距上次扫描超过 maxAgeMs 时重新扫描。
     *
     * 这是「models 文件夹变动未更新」的修复点之一：任何消费者（模型选择器、
     * 本插件面板）在读取目录前调用它，即可拿到最新列表，不必等重启或 fs.watch 事件。
     */
    refreshIfStale(maxAgeMs?: number): Promise<readonly DiscoveredModel[]>;
    /** 开始监听目录变化；目录暂不存在时定时重试（稍后创建也能被监听到）。 */
    watch(): void;
    private emit;
    dispose(): void;
}
/** 扫描目录：*.gguf（排除 mmproj 后缀与 vocab-only 文件），并为每个模型配对 mmproj。 */
export declare function scanDir(dir: string, mmprojSuffix?: string, overrides?: Record<string, string>): Promise<DiscoveredModel[]>;
/**
 * 把前缀式投影器配到最可能的主模型上。
 *
 * 评分：投影器归一化核心若是模型归一化名的子串（或反之），按核心长度打分
 * （核心越长越具体越可信）。核心为空（如 `mmproj-F32.gguf`）则不配对。
 */
export declare function pairProjectorsByPrefix(modelIds: readonly string[], projectorNames: readonly string[], mmprojSuffix?: string): Map<string, string>;
/**
 * P2 上下文启发式：在系统总内存、模型文件大小与是否 GPU offload 之间
 * 挑选“稳妥”的上下文档位。这是经验公式，精确值需按机校准：
 *   - KV 缓存预算 ≈ 可用内存 × 0.5（restart 为进程独占内存时）
 *   - 粗估每 token KV 约 = 模型大小(GB) × 16 MB/GB / 4096 上下文当量
 *     （即按“同权重参数下 4k 上下文≈16MB/G 模型”线性外推，保守取值）。
 */
export declare function pickContextLength(modelSize: number, opts: {
    autoContext: boolean;
    contextLength: number;
    gpuLayers: number;
}): number | null;
/** 列出目录内所有视觉投影文件（后缀式与前缀式）。 */
export declare function listProjectors(dir: string, mmprojSuffix?: string): Promise<string[]>;
