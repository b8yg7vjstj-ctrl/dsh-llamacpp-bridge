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
import type { Readable } from 'node:stream';
import type { Writable } from 'node:stream';
import type {
  SubprocessHandle,
  SubprocessOutputReader,
  SubprocessOutcome,
  SubprocessTerminalHandle,
} from '@deepseek-ai/dsh-subprocess';
import { TERMINATE_GRACE_MS } from '../shared.js';
import { LogHub } from './log-hub.js';
import type { LogStream } from './log-hub.js';
import type { DiscoveredModel } from './model-store.js';
import { pickContextLength, resolveModelsDir } from './model-store.js';
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

/** 把 collect 输出读进行缓冲：readFrom 偏移由本管理器独占。 */
class LineDrain {
  private buffer = '';
  private offset = 0;
  constructor(
    private readonly reader: SubprocessOutputReader,
    private readonly onLines: (lines: readonly string[], stream: LogStream) => void,
    private readonly stream: LogStream,
  ) {}

  poll(): void {
    try {
      const read = this.reader.readFrom(this.offset);
      this.offset = read.nextOffset;
      if (!read.text) return;
      this.buffer += read.text;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      if (lines.length > 0) this.onLines(lines, this.stream);
    } catch {
      // 已退出的进程尾部读取失败 —— 忽略
    }
  }
}

export class LlamaServerManager {
  private readonly ctx: Context;
  private readonly cfg: () => LlamaCppBridgeConfig;
  private readonly resolve: (id: string) => DiscoveredModel | undefined;

  private handle: SubprocessHandle | undefined;
  /** 终端模式句柄（可用 Ctrl+C / Y 交互）；与 handle 二选一。 */
  private terminal: SubprocessTerminalHandle | undefined;
  /** 进程启动形态：terminal = 真 PTY（可发 Ctrl+C/Y），collect = 管道采集。 */
  private spawnKind: 'terminal' | 'collect' = 'collect';
  private mode: RunMode = 'single';
  private status: ServerStatus = { phase: 'idle', loaded: [] };
  /** 终端输出总线（SSE 面板的数据源）。 */
  readonly logs = new LogHub();
  private readonly listeners = new Set<(s: ServerStatus, line?: string) => void>();
  private drainTimer?: NodeJS.Timeout;
  private stdoutDrain?: LineDrain;
  private stderrDrain?: LineDrain;
  private busy: Promise<void> | undefined;
  private disposed = false;

  constructor(deps: ServerManagerDeps) {
    this.ctx = deps.ctx;
    this.cfg = deps.cfg;
    this.resolve = deps.resolve;
  }

  getStatus(): ServerStatus {
    return { ...this.status, loaded: [...this.status.loaded] };
  }

  /** 日志尾部（最近 N 行，新行在后）—— 纯文本视图。 */
  logTail(lines = 200): string[] {
    return this.logs.tail(lines).map((e) => e.text);
  }

  subscribe(fn: (status: ServerStatus, line?: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** 串行化所有会改变进程状态的操作（start/stop/ensure）。 */
  run<T>(op: () => Promise<T>): Promise<T> {
    const prev = this.busy ?? Promise.resolve();
    const next = prev.then(op, op);
    this.busy = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private setStatus(patch: Partial<ServerStatus>, line?: string): void {
    this.status = { ...this.status, ...patch };
    for (const fn of [...this.listeners]) {
      try {
        fn(this.getStatus(), line);
      } catch (err) {
        console.warn('[llamacpp-bridge] status listener error:', err);
      }
    }
  }

  private pushLines(lines: readonly string[], stream: LogStream = 'system'): void {
    if (lines.length === 0) return;
    this.logs.appendLines(stream, lines);
    for (const fn of [...this.listeners]) {
      try {
        fn(this.getStatus(), lines[lines.length - 1]);
      } catch {
        /* 忽略单个监听器异常 */
      }
    }
  }

  /** 显式启动（无请求上下文时的入口）。 */
  start(modelId: string): Promise<void> {
    return this.run(async () => {
      this.mustResolve(modelId);
      await this.stopInner();
      await this.ensureSpawn(this.mustResolve(modelId));
    });
  }

  /** 停止（幂等）。 */
  stop(): Promise<void> {
    return this.run(() => this.stopInner());
  }

  /**
   * P0③④ 门：请求发出前保证“目标模型已就绪”。
   * - 服务器未运行 → 启动并等待就绪（P0③ 自动启动）。
   * - 运行中但模型不匹配 → 按策略切换（restart：先停后启；
   *   api：router unload/load）—— 都在“成功调用 OpenAI 端口之前”完成（P0④）。
   */
  ensure(modelId: string): Promise<void> {
    this.mustResolve(modelId); // 未知模型立即抛错
    return this.run(async () => {
      const s = this.status;
      if (s.phase === 'running' && s.modelId === modelId) return;
      if (s.phase === 'starting' && s.modelId === modelId) {
        await this.waitRunningOrModel(modelId);
        return;
      }
      // 切换语义（用户要求）：先让先前模型停止工作，再启动目标新模型。
      const previous = s.modelId ?? this.spawnedPid();
      if (previous !== undefined) {
        this.pushLines([`[manager] 切换模型：先停止先前模型 ${String(s.modelId ?? '')}（pid ${String(s.pid ?? '')}）`]);
      }
      await this.stopInner();
      this.pushLines([`[manager] 先前模型已停止，开始启动目标模型 ${modelId}`]);
      await this.ensureSpawn(this.mustResolve(modelId));
    });
  }

  private mustResolve(modelId: string): DiscoveredModel {
    const model = this.resolve(modelId);
    if (!model) throw new Error(`[llamacpp-bridge] unknown model: ${modelId}`);
    return model;
  }

  /** 选择启动形态：带 mmproj 的模型固定走单模型（router 无法逐模型配 mmproj）。 */
  private async ensureSpawn(model: DiscoveredModel): Promise<void> {
    const strategy = this.cfg().strategy;
    if (strategy === 'api' && !model.mmproj) {
      await this.spawnRouter();
      await this.apiLoad(model);
    } else {
      if (strategy === 'api' && model.mmproj) {
        this.pushLines(['[manager] mmproj 模型不支持 router 模式，回退单模型启动']);
      }
      await this.spawnSingle(model);
    }
  }

  private async waitRunningOrModel(modelId: string): Promise<void> {
    const start = Date.now();
    const timeout = this.cfg().startTimeoutMs;
    while (!this.disposed) {
      if (this.status.phase === 'running' && this.status.modelId === modelId) return;
      if (this.status.phase === 'error') throw new Error(this.status.error ?? 'server failed');
      if (Date.now() - start > timeout) throw new Error('llama.cpp server start timed out');
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('llama.cpp manager disposed');
  }

  private async stopInner(): Promise<void> {
    const h = this.handle;
    const term = this.terminal;
    this.handle = undefined;
    this.terminal = undefined;
    this.stopDrain();
    if (term) {
      // 终端模式：terminate() 会清理整个终端会话（SIGTERM → grace → SIGKILL）。
      this.setStatus({ phase: 'stopping', error: undefined });
      try {
        await term.terminate();
      } catch (err) {
        this.pushLines([`[manager] terminal terminate error: ${String(err)}`]);
      }
      this.markStopped();
      return;
    }
    if (!h) {
      if (this.status.phase !== 'idle') {
        this.setStatus({
          phase: 'idle',
          modelId: undefined,
          pid: undefined,
          error: undefined,
          mode: undefined,
          contextLength: undefined,
        });
      }
      return;
    }
    this.setStatus({ phase: 'stopping', error: undefined });
    try {
      h.terminate();
      await Promise.race([h.done.catch(() => undefined), h.waitForExit().catch(() => false)]);
    } catch (err) {
      this.pushLines([`[manager] stop error: ${String(err)}`]);
    }
    this.mode = 'single';
    this.setStatus({
      phase: 'idle',
      modelId: undefined,
      pid: undefined,
      loaded: [],
      error: undefined,
      mode: undefined,
      contextLength: undefined,
    });
    this.pushLines(['[manager] server stopped']);
  }

  private stopDrain(): void {
    if (this.drainTimer) clearInterval(this.drainTimer);
    this.drainTimer = undefined;
    this.stdoutDrain = undefined;
    this.stderrDrain = undefined;
  }

  /* ---------------- 进程启动（终端优先，管道回退） ---------------- */

  /**
   * 启动 llama-server。
   *
   * 优先使用终端原语 `spawnTerminal`：它分配真实 PTY，因此
   * 「发送 Ctrl+C（SIGINT 到前台进程组）」与「输入 Y 回车」都成立 —— 这正是
   * 面板上「优雅退出」按钮所需要的交互能力；终端不可用时回退到管道采集模式
   * （此时 Ctrl+C 用 SIGINT 送达，Y 通过 stdin 管道写入）。
   */
  private async startProcess(
    argv: string[],
  ): Promise<{ pid: number | undefined; done: Promise<SubprocessOutcome> }> {
    const subprocess = this.ctx.subprocess as unknown as {
      spawn: (spec: unknown) => SubprocessHandle;
      spawnTerminal?: (spec: unknown) => Promise<SubprocessTerminalHandle>;
    };

    if (typeof subprocess.spawnTerminal === 'function') {
      try {
        const handle = await subprocess.spawnTerminal({
          argv,
          cwd: process.cwd(),
          rows: 40,
          cols: 120,
          graceMs: TERMINATE_GRACE_MS,
        });
        this.terminal = handle;
        this.spawnKind = 'terminal';
        this.attachTerminalOutput(handle.output);
        this.pushLines(['[manager] 已分配终端（支持 Ctrl+C / Y 交互）']);
        return { pid: spawnedPidOf(handle), done: handle.done };
      } catch (err) {
        this.pushLines([`[manager] 终端分配失败，回退管道模式：${String(err)}`]);
      }
    }

    const handle = subprocess.spawn({
      argv,
      cwd: process.cwd(),
      stdio: {
        stdin: 'pipe',
        stdout: { maxBytes: 256 * 1024 },
        stderr: { maxBytes: 256 * 1024 },
      },
      graceMs: TERMINATE_GRACE_MS,
    });
    this.handle = handle;
    this.spawnKind = 'collect';
    const collect = handle.collected;
    if (collect.stdout) {
      this.stdoutDrain = new LineDrain(collect.stdout, (ls, stream) => this.pushLines(ls, stream), 'stdout');
    }
    if (collect.stderr) {
      this.stderrDrain = new LineDrain(collect.stderr, (ls, stream) => this.pushLines(ls, stream), 'stderr');
    }
    this.drainTimer = setInterval(() => {
      this.stdoutDrain?.poll();
      this.stderrDrain?.poll();
    }, 150);
    return { pid: spawnedPidOf(handle), done: handle.done };
  }

  /** 终端输出 → 日志总线（去掉 ANSI 控制序列，按 CR/LF 切行）。 */
  private attachTerminalOutput(output: Readable): void {
    let buffer = '';
    output.on('data', (chunk: unknown) => {
      buffer += stripAnsi(String(chunk));
      const parts = buffer.split(/\r\n|\n|\r/);
      buffer = parts.pop() ?? '';
      if (parts.length > 0) this.pushLines(parts, 'terminal');
    });
    output.on('end', () => {
      if (buffer.trim()) this.pushLines([buffer], 'terminal');
      buffer = '';
    });
  }

  /** 当前进程 pid（不同 DSH 版本的 spawn 句柄可能不含 pid，故做安全读取）。 */
  private spawnedPid(): number | undefined {
    return spawnedPidOf(this.handle);
  }

  private hasProcess(): boolean {
    return this.handle !== undefined || this.terminal !== undefined;
  }

  private clearProcessRefs(): void {
    this.handle = undefined;
    this.terminal = undefined;
  }

  private markStopped(): void {
    this.mode = 'single';
    this.setStatus({
      phase: 'idle',
      modelId: undefined,
      pid: undefined,
      loaded: [],
      error: undefined,
      mode: undefined,
      contextLength: undefined,
    });
    this.pushLines(['[manager] server stopped']);
  }

  /* ---------------- 优雅退出：Ctrl+C → Y 确认（不走 kill 路线） ---------------- */

  /** 发送 Ctrl+C：终端模式发给前台进程组；管道模式用 SIGINT（Ctrl+C 对应的信号）。 */
  private async sendCtrlC(): Promise<void> {
    const term = this.terminal;
    if (term) {
      try {
        const pgid = await term.signalForeground('SIGINT');
        this.pushLines([`[manager] 已向终端前台进程组 ${pgid} 发送 SIGINT（= Ctrl+C）`]);
        return;
      } catch (err) {
        this.pushLines([`[manager] 发送 SIGINT 失败：${String(err)}`]);
      }
    }
    const pid = this.status.pid;
    if (pid !== undefined && pid > 0) {
      try {
        process.kill(pid, 'SIGINT');
        this.pushLines([`[manager] 已向 pid ${pid} 发送 SIGINT（= Ctrl+C）`]);
      } catch (err) {
        this.pushLines([`[manager] SIGINT 发送失败：${String(err)}`]);
      }
    }
  }

  /** 写入 stdin（终端或管道）：用于发送 “Y” 确认。 */
  private async writeStdin(text: string): Promise<void> {
    const term = this.terminal;
    if (term) {
      try {
        await term.write(text);
        return;
      } catch (err) {
        this.pushLines([`[manager] 终端写入失败：${String(err)}`]);
      }
    }
    const stdin: Writable | undefined = this.handle?.stdin;
    if (stdin) {
      try {
        stdin.write(text);
        return;
      } catch (err) {
        this.pushLines([`[manager] stdin 写入失败：${String(err)}`]);
      }
    }
    this.pushLines(['[manager] 当前进程没有可写 stdin，无法发送 Y']);
  }

  private async waitGone(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.hasProcess()) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return !this.hasProcess();
  }

  /**
   * 优雅退出：Ctrl+C（SIGINT）→ 等提示 → 发送 Y 回车 → 等退出；
   * 仍未退出时再补一次 Ctrl+C，最后才回退到 terminate()（SIGTERM→grace→SIGKILL）。
   * 全程不使用 SIGKILL 直杀。
   */
  gracefulStop(): Promise<{ ok: boolean; steps: string[] }> {
    return this.run(async () => {
      const steps: string[] = [];
      if (!this.hasProcess()) {
        this.pushLines(['[manager] 服务器未运行，无需退出']);
        return { ok: false, steps: ['未运行'] };
      }
      this.setStatus({ phase: 'stopping', error: undefined });

      this.pushLines(['[manager] 优雅退出：先发送 Ctrl+C …']);
      await this.sendCtrlC();
      steps.push('已发送 Ctrl+C');

      // 给 llama-server 打印确认提示的时间
      await new Promise((r) => setTimeout(r, 800));
      if (!this.hasProcess()) {
        steps.push('进程已直接退出（无需 Y）');
        this.pushLines(['[manager] 进程已退出（无需 Y 确认）']);
        this.markStopped();
        return { ok: true, steps };
      }

      this.pushLines(['[manager] 发送 “Y” 确认退出 …']);
      await this.writeStdin('Y\n');
      steps.push('已发送 Y 确认');

      if (await this.waitGone(8000)) {
        steps.push('确认后已退出');
        this.markStopped();
        return { ok: true, steps };
      }

      this.pushLines(['[manager] 8 秒内未退出，再补一次 Ctrl+C …']);
      await this.sendCtrlC();
      steps.push('补发 Ctrl+C');
      if (await this.waitGone(5000)) {
        steps.push('补发后已退出');
        this.markStopped();
        return { ok: true, steps };
      }

      this.pushLines(['[manager] 仍无响应，回退 terminate()（SIGTERM → grace → SIGKILL）']);
      steps.push('回退 terminate()');
      await this.stopInner();
      return { ok: true, steps };
    });
  }

  /** 公共 argv 段：host/port/ctx/gpu/附加参数。 */
  private commonArgs(ctx: number | null): string[] {
    const cfg = this.cfg();
    const argv: string[] = ['--host', cfg.host, '--port', String(cfg.port)];
    if (ctx) argv.push('-c', String(ctx));
    if (cfg.gpuLayers >= 0) argv.push('-ngl', String(cfg.gpuLayers));
    argv.push(...cfg.additionalArgs);
    return argv;
  }

  /** 单模型进程启动：-m <file>（含 mmproj）。 */
  private async spawnSingle(model: DiscoveredModel): Promise<void> {
    const cfg = this.cfg();
    const ctx = pickContextLength(model.size, {
      autoContext: cfg.autoContext,
      contextLength: cfg.contextLength,
      gpuLayers: cfg.gpuLayers,
    });
    const argv = [cfg.executable, '-m', model.file, ...this.commonArgs(ctx)];
    if (model.mmproj) argv.push('--mmproj', model.mmproj);
    await this.doSpawn(argv, 'single', model.id, ctx);
  }

  /** router 模式进程启动：--models-dir <dir>，不带 -m（加载由 apiLoad 显式发起）。 */
  private async spawnRouter(): Promise<void> {
    const cfg = this.cfg();
    const ctx = pickContextLength(0, {
      autoContext: cfg.autoContext,
      contextLength: cfg.contextLength,
      gpuLayers: cfg.gpuLayers,
    });
    const argv = [
      cfg.executable,
      '--models-dir', resolveModelsDir(cfg.modelsDir),
      '--no-models-autoload',
      ...this.commonArgs(ctx),
    ];
    await this.doSpawn(argv, 'router', undefined, ctx);
  }

  private async doSpawn(argv: string[], mode: RunMode, modelId: string | undefined, ctx: number | null): Promise<void> {
    const cfg = this.cfg();
    if (!cfg.executable) {
      throw new Error(
        '[llamacpp-bridge] 未配置 llama-server 可执行文件：请在 DSH「设置 → llama.cpp」中选择 ' +
          '(自动检测会给出 ~/llama.cpp/build/bin 等位置；也可直接填写绝对路径)',
      );
    }
    this.mode = mode;
    this.setStatus({
      phase: 'starting',
      modelId,
      pid: undefined,
      error: undefined,
      loaded: [],
      mode,
      contextLength: ctx ?? undefined,
    });
    this.pushLines([
      `[manager] starting ${mode === 'router' ? 'llama.cpp router' : `llama.cpp with ${modelId ?? ''}`}`,
    ]);
    this.pushLines([`[manager] context: ${ctx ? String(ctx) : 'llama.cpp 默认'}`]);

    const spawned = await this.startProcess(argv);
    this.setStatus({ pid: spawned.pid });

    if (cfg.debug) this.pushLines([`[manager] exec: ${argv.join(' ')}`]);

    void spawned.done.then(
      (outcome) => {
        this.stopDrain();
        this.clearProcessRefs();
        const code = outcome.exitCode ?? `signal:${outcome.signal ?? '?'}`;
        this.pushLines([`[manager] server process exited (${code})`]);
        if (this.status.phase === 'starting' || this.status.phase === 'running') {
          this.setStatus({
            phase: 'error',
            modelId: undefined,
            pid: undefined,
            error: `llama.cpp exited unexpectedly (${code})`,
          });
        }
      },
      (err) => {
        this.pushLines([`[manager] spawn/transport failure: ${String(err)}`]);
        if (this.status.phase === 'starting') {
          this.setStatus({ phase: 'error', error: String(err) });
        }
      },
    );

    const ready = await this.waitHttpReady(cfg.startTimeoutMs);
    if (!ready) {
      await this.stopInner();
      throw new Error(`llama.cpp server did not become ready on :${cfg.port} within ${cfg.startTimeoutMs}ms`);
    }
    if (!this.hasProcess()) throw new Error('llama.cpp server stopped while starting');
    this.setStatus({ phase: 'running' });
    this.pushLines([`[manager] ready on http://${cfg.host}:${cfg.port} (${mode})`]);
  }

  /**
   * router 模式动态加载：先卸载已加载（若与目标不同文件），再 POST
   * /models/load，轮询 GET /v1/models 直到目标 loaded。
   */
  private async apiLoad(model: DiscoveredModel): Promise<void> {
    const cfg = this.cfg();
    const fileName = `${model.id}.gguf`;
    this.setStatus({ phase: 'starting', modelId: model.id, error: undefined });
    this.pushLines([`[manager] api load ${fileName} …`]);

    try {
      // 卸载当前占用（尽力而为：/models/unload；旧端点 404 亦可忽略）
      const current = await this.probeLoaded().catch(() => [] as string[]);
      for (const id of current) {
        if (this.matchesModel(id, model.id, fileName)) continue;
        await this.manageCall('POST', '/models/unload', { model: this.fileNameFor(id) }).catch(() => undefined);
      }
      await this.manageCall('POST', '/models/load', { model: fileName });

      const deadline = Date.now() + cfg.startTimeoutMs;
      while (Date.now() < deadline) {
        if (this.disposed) throw new Error('llama.cpp manager disposed');
        const loaded = await this.probeLoaded().catch(() => [] as string[]);
        if (loaded.some((id) => this.matchesModel(id, model.id, fileName))) {
          this.setStatus({ phase: 'running', modelId: model.id, loaded });
          this.pushLines([`[manager] model ${model.id} loaded (api)`]);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`model ${model.id} did not finish loading within ${cfg.startTimeoutMs}ms`);
    } catch (err) {
      // 管理端点不可用/加载失败 → 回退单模型重启
      this.pushLines([`[manager] api load failed (${String(err)}); falling back to single-model restart`]);
      await this.stopInner();
      await this.spawnSingle(model);
    }
  }

  private matchesModel(reported: string, id: string, fileName: string): boolean {
    return reported === id || reported === fileName || reported.endsWith(`/${fileName}`);
  }

  /** 把 /v1/models 报告的 id 规整回 fileName（未知则原样）。 */
  private fileNameFor(reported: string): string {
    const base = reported.split('/').pop() ?? reported;
    return base.endsWith('.gguf') ? base : `${base}.gguf`;
  }

  private async manageCall(method: string, path: string, body?: unknown): Promise<Response> {
    const cfg = this.cfg();
    const res = await fetch(`http://${cfg.host}:${cfg.port}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}`);
    return res;
  }

  private async waitHttpReady(timeoutMs: number): Promise<boolean> {
    const cfg = this.cfg();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.disposed || this.status.phase === 'error') return false;
      try {
        const res = await fetch(`http://${cfg.host}:${cfg.port}/v1/models`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return true;
      } catch {
        // 尚未监听/未就绪 —— 继续等
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  /** GET /v1/models 解析已加载模型 id（尽力而为，失败返回空）。 */
  async probeLoaded(): Promise<string[]> {
    const cfg = this.cfg();
    try {
      const res = await fetch(`http://${cfg.host}:${cfg.port}/v1/models`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { data?: Array<{ id?: string }> };
      return (body.data ?? []).map((d) => d.id ?? '').filter(Boolean);
    } catch {
      return [];
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopDrain();
    const h = this.handle;
    const term = this.terminal;
    this.handle = undefined;
    this.terminal = undefined;
    try {
      h?.terminate();
    } catch {
      /* 忽略 */
    }
    try {
      void term?.terminate();
    } catch {
      /* 忽略 */
    }
    this.listeners.clear();
    this.logs.dispose();
  }
}

/** 去掉终端输出里的 ANSI 控制序列（颜色、光标、OSC 标题等）。 */
function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b[@-Z\\-_]/g, '');
}

/** 安全读取子进程句柄的 pid（句柄结构随 DSH 版本可能不同）。 */
function spawnedPidOf(handle: unknown): number | undefined {
  const pid = (handle as { pid?: unknown } | undefined)?.pid;
  return typeof pid === 'number' ? pid : undefined;
}
