/**
 * llama.cpp Bridge —— host 端入口（cordis apply）。
 *
 * P0 映射：
 *  ① 后端模型切换：模型目录 = model-store（modelsDir 全量），
 *     已加载模型 = LlamaServerManager 运行态，二者分离，不依赖启动脚本。
 *  ③ 自动启动：adapter.stream() → ensure() → 未运行则启动并等待就绪。
 *  ④ 热切换：ensure() 在“请求到达 OpenAI 端口前”执行卸载→加载。
 *  ⑤ 隔离：只拥有 `llamacpp` 路由与自有命名空间，不挂钩其他 provider。
 *  ⑥ 安装即用：安装后无需手改 YAML —— host 自动发现 llama.cpp 可执行文件与
 *     模型目录（~/llama.cpp 下 build/、build/bin/、build/bin/release/ 的
 *     llama-server / llama.exe / llama-server.exe，以及 PATH），结果作为 settings
 *     的 base 层默认值；浏览器端设置页（settings.section）提供图形化引导，
 *     用户保存的值写入 user 层并永远优先。
 * P1：model-store 扫描 + mmproj 配对；目录变更自动重扫，设置页保存后热生效。
 * P2：autoContext 启发式（model-store.pickContextLength）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { BridgeCfg } from './config.js';
/**
 * Host 模块形状（对齐 cordis-plugin-loader 的装载语义）：
 * - loader 以 entry.name 为 specifier `import()` 本包（exports["."]），
 *   再 `unwrapExports`：无 default 时保留命名导出命名空间；
 * - `registry.plugin(ns, config)` 要求命名空间含 `name`/`inject`/`apply`
 *   （与 dsh-llm-pi-ai / dsh-pocket 的宿主入口同形）；
 * - `inject` 列出需要在本插件 apply 前已可用的 cordis 服务。
 */
export declare const name = "dsh-llamacpp-bridge";
export declare const inject: string[];
/** 插件入口（与 DSH 内置 host 包同形；async：先做环境自动发现）。 */
export declare function apply(ctx: Context, entryConfig?: Partial<BridgeCfg>): Promise<void>;
