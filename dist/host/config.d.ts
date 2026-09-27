/**
 * 配置模型（schemastery schema）。
 *
 * 说明：llm-pi-ai 是自带 `llm-pi-ai` 命名空间的适配器插件；本插件不以
 * “进程代理 + 改写他人命名空间”的方式接入，而是自持 provider 路由
 * `llamacpp`（见 ./adapter.ts），因此它的模型目录、端口、进程参数全部
 * 收敛在本命名空间下，与 DSH 的适配器注册模型一致。
 */
/** 插件配置（解析后的值形态，所有字段有默认值）。 */
export interface BridgeCfg {
    displayName: string;
    executable: string;
    modelsDir: string;
    host: string;
    port: number;
    strategy: 'restart' | 'api';
    contextLength: number;
    autoContext: boolean;
    gpuLayers: number;
    mmprojSuffix: string;
    /** 视觉投影文件手动绑定：{ 模型id: 投影文件名 }（优先级最高）。 */
    mmprojOverrides: Record<string, string>;
    additionalArgs: string[];
    startTimeoutMs: number;
    debug: boolean;
}
export type LlamaCppBridgeConfig = BridgeCfg;
/** JS 默认值（与 schema 默认一致，供 entry 层合并）。 */
export declare function defaultConfig(): BridgeCfg;
/** 用户设置命名空间用的 schemastery schema（运行期值）。 */
export declare function buildBridgeSchema(): unknown;
/**
 * “自动发现结果”命名空间的 schema（只读展示用）：
 * host 把发现到的可执行文件与模型目录候选放进 base 层，设置页据此引导用户。
 */
export declare function buildDiscoverySchema(): unknown;
/** 把解析出的策略字符串规整为合法值。 */
export declare function normalizeStrategy(value: string): 'restart' | 'api';
/** 供 ctx.llm.registerConfigurableProviders 使用的目录项。 */
export declare function configurableProviderEntry(): {
    provider: string;
    displayName: string;
    settingsNs: string;
    settingsPath: readonly string[];
    declared: boolean;
};
