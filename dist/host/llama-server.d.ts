/**
 * llama.cpp 服务器进程管理器（host 侧）。
 *
 * P0③/④ 的实现载体：进程启动/停止/切换、就绪探测、日志环形缓冲。
 * 通过 `ctx.subprocess.spawn`（collect 模式）捕获 stdout/stderr —— 该
 * 契约与 dsh-subprocess 类型一致，tree-scoped 终止。
 *
 * 两种运行形态（由 cfg.strategy 选择）：
 *  - 'restart'（默认）：每次 ensure 以 `-m <file>` 启动/重启单一模型进程。
 *  - 'api'：以 router 模式启动（`--models-dir`，不带 -m），随后用
 *    llama.cpp 模型管理端点动态 unload/load —— 免重启切换（多进程架构，
 *    单模型崩溃不影响其它模型）。端点：POST /models/load、POST /models/unload，
 *    body `{ "model": "<文件名>.gguf" }`（llama.cpp “Model Management” 特性，
 *    需较新构建）。mmproj 逐模型参数 router 模式不支持：带 mmproj 的模型
 *    自动回退单模型 restart，保证 P1 视觉配对语义。
 */
import type { Context } from '@deepseek-ai/cordis';
import { LogHub } from './log-hub.js';
import type { DiscoveredModel } from './model-store.js';
import type { LlamaCppBridgeConfig } from './config.js';
export type ServerPhase = 'idle' | 'starting' | 'running' | 'stopping' | 'error';
type RunMode = 'single' | 'router';
export interface ServerStatus {
    phase: ServerPhase;
    /** 当前（或正在启动/加载）的模型 id。 */
    modelId?: string;
    pid?: number;
    startedAt?: number;
    /** 就绪探测时 llama.cpp 自报的已加载模型（尽力而为）。 */
    loaded: readonly string[];
    /** 运行形态：单模型进程 / router 多模型。 */
    mode?: RunMode;
    /** 本次实际采用的上下文长度（启发式/显式），便于用户核对 P2。 */
    contextLength?: number;
    error?: string;
}
export interface ServerManagerDeps {
    ctx: Context;
    cfg: () => LlamaCppBridgeConfig;
    resolve: (id: string) => DiscoveredModel | undefined;
}
export declare class LlamaServerManager {
    private readonly ctx;
    private readonly cfg;
    private readonly resolve;
    private handle;
    /** 终端模式句柄（可用 Ctrl+C / Y 交互）；与 handle 二选一。 */
    private terminal;
    /** 进程启动形态：terminal = 真 PTY（可发 Ctrl+C/Y），collect = 管道采集。 */
    private spawnKind;
    private mode;
    private status;
    /** 终端输出总线（SSE 面板的数据源）。 */
    readonly logs: LogHub;
    private readonly listeners;
    private drainTimer?;
    private stdoutDrain?;
    private stderrDrain?;
    private busy;
    private disposed;
    constructor(deps: ServerManagerDeps);
    getStatus(): ServerStatus;
    /** 日志尾部（最近 N 行，新行在后）—— 纯文本视图。 */
    logTail(lines?: number): string[];
    subscribe(fn: (status: ServerStatus, line?: string) => void): () => void;
    /** 串行化所有会改变进程状态的操作（start/stop/ensure）。 */
    run<T>(op: () => Promise<T>): Promise<T>;
    private setStatus;
    private pushLines;
    /** 显式启动（无请求上下文时的入口）。 */
    start(modelId: string): Promise<void>;
    /** 停止（幂等）。 */
    stop(): Promise<void>;
    /**
     * P0③④ 门：请求发出前保证“目标模型已就绪”。
     * - 服务器未运行 → 启动并等待就绪（P0③ 自动启动）。
     * - 运行中但模型不匹配 → 按策略切换（restart：先停后启；
     *   api：router unload/load）—— 都在“成功调用 OpenAI 端口之前”完成（P0④）。
     */
    ensure(modelId: string): Promise<void>;
    private mustResolve;
    /** 选择启动形态：带 mmproj 的模型固定走单模型（router 无法逐模型配 mmproj）。 */
    private ensureSpawn;
    private waitRunningOrModel;
    private stopInner;
    private stopDrain;
    /**
     * 启动 llama-server。
     *
     * 优先使用终端原语 `spawnTerminal`：它分配真实 PTY，因此
     * 「发送 Ctrl+C（SIGINT 到前台进程组）」与「输入 Y 回车」都成立 —— 这正是
     * 面板上「优雅退出」按钮所需要的交互能力；终端不可用时回退到管道采集模式
     * （此时 Ctrl+C 用 SIGINT 送达，Y 通过 stdin 管道写入）。
     */
    private startProcess;
    /** 终端输出 → 日志总线（去掉 ANSI 控制序列，按 CR/LF 切行）。 */
    private attachTerminalOutput;
    /** 当前进程 pid（不同 DSH 版本的 spawn 句柄可能不含 pid，故做安全读取）。 */
    private spawnedPid;
    private hasProcess;
    private clearProcessRefs;
    private markStopped;
    /** 发送 Ctrl+C：终端模式发给前台进程组；管道模式用 SIGINT（Ctrl+C 对应的信号）。 */
    private sendCtrlC;
    /** 写入 stdin（终端或管道）：用于发送 “Y” 确认。 */
    private writeStdin;
    private waitGone;
    /**
     * 优雅退出：Ctrl+C（SIGINT）→ 等提示 → 发送 Y 回车 → 等退出；
     * 仍未退出时再补一次 Ctrl+C，最后才回退到 terminate()（SIGTERM→grace→SIGKILL）。
     * 全程不使用 SIGKILL 直杀。
     */
    gracefulStop(): Promise<{
        ok: boolean;
        steps: string[];
    }>;
    /** 公共 argv 段：host/port/ctx/gpu/附加参数。 */
    private commonArgs;
    /** 单模型进程启动：-m <file>（含 mmproj）。 */
    private spawnSingle;
    /** router 模式进程启动：--models-dir <dir>，不带 -m（加载由 apiLoad 显式发起）。 */
    private spawnRouter;
    private doSpawn;
    /**
     * router 模式动态加载：先卸载已加载（若与目标不同文件），再 POST
     * /models/load，轮询 GET /v1/models 直到目标 loaded。
     */
    private apiLoad;
    private matchesModel;
    /** 把 /v1/models 报告的 id 规整回 fileName（未知则原样）。 */
    private fileNameFor;
    private manageCall;
    private waitHttpReady;
    /** GET /v1/models 解析已加载模型 id（尽力而为，失败返回空）。 */
    probeLoaded(): Promise<string[]>;
    dispose(): void;
}
export {};
