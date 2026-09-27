/**
 * 配置模型（schemastery schema）。
 *
 * 说明：llm-pi-ai 是自带 `llm-pi-ai` 命名空间的适配器插件；本插件不以
 * “进程代理 + 改写他人命名空间”的方式接入，而是自持 provider 路由
 * `llamacpp`（见 ./adapter.ts），因此它的模型目录、端口、进程参数全部
 * 收敛在本命名空间下，与 DSH 的适配器注册模型一致。
 */
import Schema from '@deepseek-ai/schemastery';
import { DEFAULT_HOST, DEFAULT_MMPROJ_SUFFIX, DEFAULT_PORT, PROVIDER_ID } from '../shared.js';
/** JS 默认值（与 schema 默认一致，供 entry 层合并）。 */
export function defaultConfig() {
    return {
        displayName: 'Local llama.cpp',
        // 空 = 交给 host 自动发现（base 层默认值）；用户保存的值永远优先。
        executable: '',
        modelsDir: '',
        host: DEFAULT_HOST,
        port: DEFAULT_PORT,
        strategy: 'restart',
        contextLength: 0,
        autoContext: false,
        gpuLayers: -1,
        mmprojSuffix: DEFAULT_MMPROJ_SUFFIX,
        mmprojOverrides: {},
        additionalArgs: [],
        startTimeoutMs: 120_000,
        debug: false,
    };
}
/** 用户设置命名空间用的 schemastery schema（运行期值）。 */
export function buildBridgeSchema() {
    return Schema.object({
        displayName: Schema.string().default('Local llama.cpp'),
        executable: Schema.string().default(''),
        modelsDir: Schema.string().default(''),
        host: Schema.string().default(DEFAULT_HOST),
        port: Schema.number().default(DEFAULT_PORT),
        strategy: Schema.string().default('restart'),
        contextLength: Schema.number().default(0),
        autoContext: Schema.boolean().default(false),
        gpuLayers: Schema.number().default(-1),
        mmprojSuffix: Schema.string().default(DEFAULT_MMPROJ_SUFFIX),
        mmprojOverrides: Schema.dict(Schema.string()).default({}),
        additionalArgs: Schema.array(Schema.string()).default([]),
        startTimeoutMs: Schema.number().default(120_000),
        debug: Schema.boolean().default(false),
    });
}
/**
 * “自动发现结果”命名空间的 schema（只读展示用）：
 * host 把发现到的可执行文件与模型目录候选放进 base 层，设置页据此引导用户。
 */
export function buildDiscoverySchema() {
    return Schema.object({
        executables: Schema.array(Schema.object({
            path: Schema.string().default(''),
            source: Schema.string().default(''),
        })).default([]),
        modelsDirs: Schema.array(Schema.object({
            dir: Schema.string().default(''),
            ggufCount: Schema.number().default(0),
        })).default([]),
        models: Schema.array(Schema.string()).default([]),
        projectors: Schema.array(Schema.object({
            file: Schema.string().default(''),
            modelId: Schema.string().default(''),
        })).default([]),
        updatedAt: Schema.string().default(''),
    });
}
/** 把解析出的策略字符串规整为合法值。 */
export function normalizeStrategy(value) {
    return value === 'api' ? 'api' : 'restart';
}
/** 供 ctx.llm.registerConfigurableProviders 使用的目录项。 */
export function configurableProviderEntry() {
    return {
        provider: PROVIDER_ID,
        displayName: 'Local llama.cpp (bridge)',
        // 配置面指向本插件的命名空间；profile 即该节整体（无子路径前缀）。
        settingsNs: 'llamacpp-bridge',
        settingsPath: [],
        declared: true,
    };
}
//# sourceMappingURL=config.js.map