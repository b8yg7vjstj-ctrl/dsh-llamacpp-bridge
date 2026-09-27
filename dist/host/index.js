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
import { DISCOVERY_NS, PROVIDER_ID, SETTINGS_NS } from '../shared.js';
import { LlamaCppAdapter } from './adapter.js';
import { buildBridgeSchema, buildDiscoverySchema, configurableProviderEntry, defaultConfig, normalizeStrategy, } from './config.js';
import { bestExecutable, bestModelsDir, discoverEnvironmentSafe } from './discover.js';
import { LlamaServerManager } from './llama-server.js';
import { ModelStore, listProjectors } from './model-store.js';
import { makeTerminalRoutes, purposeLines } from './terminal-routes.js';
/**
 * Host 模块形状（对齐 cordis-plugin-loader 的装载语义）：
 * - loader 以 entry.name 为 specifier `import()` 本包（exports["."]），
 *   再 `unwrapExports`：无 default 时保留命名导出命名空间；
 * - `registry.plugin(ns, config)` 要求命名空间含 `name`/`inject`/`apply`
 *   （与 dsh-llm-pi-ai / dsh-pocket 的宿主入口同形）；
 * - `inject` 列出需要在本插件 apply 前已可用的 cordis 服务。
 */
export const name = 'dsh-llamacpp-bridge';
export const inject = ['llm', 'settings', 'subprocess', 'webServer'];
/** 插件入口（与 DSH 内置 host 包同形；async：先做环境自动发现）。 */
export async function apply(ctx, entryConfig) {
    const log = (...a) => console.log('[llamacpp-bridge]', ...a);
    log('initializing');
    // —— 环境自动发现：可执行文件 + 模型目录候选（只作 base 默认值）——
    const report = await discoverEnvironmentSafe(3000);
    const foundExe = bestExecutable(report);
    const foundModels = bestModelsDir(report);
    const entry = { ...defaultConfig(), ...entryConfig };
    if (!entry.executable && foundExe)
        entry.executable = foundExe;
    if (!entry.modelsDir && foundModels)
        entry.modelsDir = foundModels;
    log(`detected ${report.executables.length} executable candidate(s), ` +
        `${report.modelsDirs.length} models dir candidate(s)`);
    for (const exe of report.executables.slice(0, 5))
        log(`  exe: ${exe.path}  [${exe.source}]`);
    for (const dir of report.modelsDirs.slice(0, 5))
        log(`  models: ${dir.dir}  (${dir.ggufCount} gguf)`);
    if (!entry.executable) {
        log('未找到 llama-server/llama.exe：请在 DSH「设置 → llama.cpp」中图形化选择可执行文件');
    }
    if (!entry.modelsDir) {
        log('未找到模型目录：请在 DSH「设置 → llama.cpp」中图形化选择模型目录（.gguf 所在文件夹）');
    }
    // —— 配置：settings 命名空间（存在时）优先于 entry 配置 ——
    //   分层：schema 默认值 → base（本插件 entry + 自动发现结果）→ 用户文档节。
    let cfg = entry;
    const settings = ctx.settings;
    const settingsScope = settings
        ? settings.register(SETTINGS_NS, buildBridgeSchema(), {
            base: entry,
        })
        : undefined;
    // 自动发现结果：放进独立命名空间的 base 层，供浏览器端设置页渲染引导候选。
    try {
        if (settings) {
            settings.register(DISCOVERY_NS, buildDiscoverySchema(), { base: report });
        }
    }
    catch (err) {
        log('discovery namespace registration failed:', err);
    }
    const adopt = (next) => {
        const merged = { ...entry, ...next };
        merged.strategy = normalizeStrategy(String(merged.strategy));
        return merged;
    };
    if (settingsScope)
        cfg = adopt(settingsScope.get());
    const cfgNow = () => cfg;
    // —— 模型目录（P1 扫描 + mmproj + watch）——
    const store = new ModelStore({
        modelsDir: cfg.modelsDir || '.',
        mmprojSuffix: cfg.mmprojSuffix,
        mmprojOverrides: cfg.mmprojOverrides,
    });
    // 每次启动都全量重扫（并建立监听 + 兜底轮询），确保 models 文件夹的变动即时反映。
    void store
        .refresh()
        .then(async (m) => {
        log(`scanned ${m.length} model(s) from ${store.dir} (startup rescan)`);
        // 视觉投影文件（mmproj）配对情况：配上的与被排除的都明确打印，便于排查。
        const vision = m.filter((x) => x.mmproj);
        for (const v of vision) {
            log(`  vision: ${v.id}  ←  ${v.mmproj?.split('/').pop() ?? ''}`);
        }
        const projectors = await listProjectors(store.dir, cfg.mmprojSuffix);
        const used = new Set(vision.map((v) => v.mmproj?.split('/').pop()));
        const unmatched = projectors.filter((f) => !used.has(f));
        if (unmatched.length > 0) {
            log(`  unmatched mmproj: ${unmatched.join(', ')}` +
                '（可在 设置 → llama.cpp 手动绑定到某个模型）');
        }
    });
    store.watch();
    // —— llama.cpp 进程管理器 ——
    const server = new LlamaServerManager({
        ctx,
        cfg: cfgNow,
        resolve: (id) => store.get(id),
    });
    // 配置热更新（设置页保存即时生效：目录重扫/换目录；传输字段变化时停服）
    if (settingsScope) {
        settingsScope.watch(() => {
            const next = adopt(settingsScope.get());
            const prev = cfg;
            cfg = next;
            log('settings updated');
            const dirChanged = next.modelsDir !== prev.modelsDir || next.mmprojSuffix !== prev.mmprojSuffix;
            const overridesChanged = JSON.stringify(next.mmprojOverrides ?? {}) !== JSON.stringify(prev.mmprojOverrides ?? {});
            if (dirChanged || overridesChanged) {
                store.reconfigure({
                    modelsDir: next.modelsDir,
                    mmprojSuffix: next.mmprojSuffix,
                    mmprojOverrides: next.mmprojOverrides,
                });
            }
            else {
                void store.refresh();
            }
            const transportChanged = next.port !== prev.port || next.host !== prev.host || next.executable !== prev.executable;
            if (transportChanged) {
                void server.stop().catch((e) => log('stop after transport change failed:', e));
            }
        });
    }
    // —— 注册 LlmAdapter（P0⑤：仅路由 llamacpp）——
    const llm = ctx.llm;
    const adapter = new LlamaCppAdapter({
        cfg: () => cfgNow(),
        models: () => store.models(),
        refreshModels: () => store.refreshIfStale(),
        ensure: (modelId) => server.ensure(modelId),
    });
    try {
        llm.registerAdapter([PROVIDER_ID], adapter);
        log(`registered provider route ${PROVIDER_ID}`);
    }
    catch (err) {
        // 典型冲突：用户在 llm-pi-ai settings 里也配了 llamacpp profile。
        log(`failed to register route ${PROVIDER_ID}: ${String(err)} ` +
            '(remove any "llamacpp" profile under llm-pi-ai settings, then reload)');
    }
    try {
        llm.registerConfigurableProviders([configurableProviderEntry()]);
    }
    catch (err) {
        // 目录注册冲突可容忍：路由本身已注册。但不能静默——配置面看不到本 provider 时要能查。
        log('registerConfigurableProviders failed (route still registered):', err);
    }
    // P0⑤：不订阅/不改写其它 provider —— llm 拓扑事件不挂钩任何行为。
    // —— 「llama.cpp 终端输出监控」同源数据面（HTTP + SSE）——
    //   参考 @linxin666/dsh-client-ui-task-board：官方 ctx.webServer.register 挂路由，
    //   SSE 推送日志/状态，loopback + Host + 同源标记三重栅栏。
    const webServer = ctx.webServer;
    if (webServer) {
        try {
            for (const route of makeTerminalRoutes({
                logs: server.logs,
                source: {
                    status: () => server.getStatus(),
                    purpose: () => purposeLines(),
                    models: () => store.models().map((m) => ({ id: m.id, name: m.name, mmproj: m.mmproj })),
                },
                actions: {
                    // 面板「优雅退出」按钮：Ctrl+C（SIGINT）→ Y 确认 → 等退出；不直杀。
                    gracefulStop: () => server.gracefulStop(),
                },
            })) {
                ctx.effect(() => webServer.register(route));
            }
            log('terminal monitor routes registered: /api/llamacpp-bridge/{state,events}');
        }
        catch (err) {
            log('terminal monitor route registration failed:', err);
        }
    }
    else {
        log('webServer service unavailable: terminal monitor panel disabled (host-only mode)');
    }
    // 卸载：释放进程与监听
    ctx.effect(() => () => {
        log('disposing');
        server.dispose();
        store.dispose();
    });
}
//# sourceMappingURL=index.js.map