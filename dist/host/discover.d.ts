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
export declare function emptyReport(): DiscoveryReport;
/** 执行一次发现（同步文件系统调用，规模很小）。 */
export declare function discoverEnvironment(home?: string): DiscoveryReport;
/** 带超时保护的发现（apply 期间不阻塞主界面启动）。 */
export declare function discoverEnvironmentSafe(timeoutMs?: number): Promise<DiscoveryReport>;
/** 首选可执行文件（服务端优先）。 */
export declare function bestExecutable(report: DiscoveryReport): string | undefined;
/** 首选模型目录（gguf 数最多者优先，其次 llama.cpp/models）。 */
export declare function bestModelsDir(report: DiscoveryReport): string | undefined;
