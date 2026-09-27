/**
 * `llamacpp` provider 路由的 LlmAdapter（host 侧）。
 *
 * 契约依据 `@deepseek-ai/dsh-llm` 的 lib/types：LlmAdapter /
 * GenerateOptions / StreamChunk / LlmModelInfo …（逐一核对过 d.ts）。
 *
 * 职责：
 *  - 每次 stream() 先 await server.ensure(model) —— P0③④ 的时序保证点：
 *    “在成功调用 OpenAI 端口之前，先卸载当前模型、加载所选模型”。
 *  - 把 DSH 消息/流词汇翻译成 llama.cpp 的 OpenAI Chat Completions SSE，
 *    再把 SSE 翻译回 StreamChunk（text / reasoning / tool-call / usage /
 *    finish）。
 *  - P0①⑤⑥：模型目录即 store（非启动脚本全量）；只拥有 `llamacpp`
 *    路由，不触碰其他 provider。
 */

import {
  attributionHeaders,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { PROVIDER_ID, truncateModelName } from '../shared.js';
import type { DiscoveredModel } from './model-store.js';
import { pickContextLength } from './model-store.js';

/*
 * 兼容性策略：只依赖插件真正用到的「最小结构类型」，不 import DSH 内部类型名
 * （不同 DSH 版本里 Message / ToolCallBlock / ToolResultBlock 的导出与联合成员曾发生变化）。
 * 运行时行为不变，仅类型层面解耦。见 README「兼容性」。
 */
interface BlockLike {
  type: string;
  text?: unknown;
  /** tool-call 块 */
  id?: string;
  name?: string;
  arguments?: string;
  /** tool-result 块 */
  toolCallId?: string;
  isError?: boolean;
  content?: readonly BlockLike[];
}

interface MessageLike {
  role: string;
  content: readonly BlockLike[];
  source?: { kind?: string };
}

export interface LlamaCppAdapterDeps {
  cfg: () => {
    displayName: string;
    host: string;
    port: number;
    contextLength: number;
    autoContext: boolean;
    gpuLayers: number;
    strategy: string;
  };
  models: () => readonly DiscoveredModel[];
  /**
   * 读取目录前按需重扫（目录指纹变化或超过 maxAge 时重扫）。
   * 这是「models 文件夹变动未更新」的修复点：模型选择器每次取目录都会拿到最新列表。
   */
  refreshModels?: () => Promise<unknown>;
  ensure: (modelId: string) => Promise<void>;
}

interface OpenAiDeltaToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: OpenAiDeltaToolCall[];
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string; code?: string };
}

export class LlamaCppAdapter extends LlmAdapter {
  constructor(private readonly deps: LlamaCppAdapterDeps) {
    super();
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.deps.cfg().displayName };
  }

  override providerRetryPolicy(): undefined {
    return undefined; // 使用默认重试策略
  }

  override async listModels(_provider: string): Promise<readonly LlmModelInfo[]> {
    await this.deps.refreshModels?.().catch(() => {
      /* 扫描失败沿用上次结果 */
    });
    return this.deps.models().map((m) => ({
      provider: PROVIDER_ID,
      id: m.id,
      // 显示名超过 30 字符时截断并加省略号（id 保持完整，不影响选择/调用）
      name: truncateModelName(m.name),
      description: m.mmproj ? '多模态（mmproj）' : undefined,
      inputModalities: ['text'] as const,
    }));
  }

  override async resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    await this.deps.refreshModels?.().catch(() => {
      /* 扫描失败沿用上次结果 */
    });
    const m = this.deps.models().find((x) => x.id === model);
    if (!m) throw new LlmError(`Unknown model for route ${provider}: ${model}`, 'UNKNOWN_MODEL');
    const cfg = this.deps.cfg();
    const ctx = pickContextLength(m.size, {
      autoContext: cfg.autoContext,
      contextLength: cfg.contextLength,
      gpuLayers: cfg.gpuLayers,
    });
    const contextWindow = m.contextWindow ?? ctx ?? 8192;
    return {
      provider,
      id: model,
      name: truncateModelName(m.name),
      inputModalities: ['text'],
      context: { contextWindow },
      defaultMaxTokens: Math.min(8192, Math.floor(contextWindow / 2)),
    };
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // P0③④：任何请求到达 OpenAI 端口之前，先保证所选模型已就绪。
    await this.deps.ensure(options.model);

    const cfg = this.deps.cfg();
    const base = `http://${cfg.host}:${cfg.port}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: options.model,
      messages: buildWireMessages(options),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.stop && options.stop.length > 0) body.stop = options.stop;
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    let res: Response;
    try {
      res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...attributionHeaders() },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      const code = pickFailureCode(text, res.status);
      throw new LlmError(
        `llama.cpp request failed (HTTP ${res.status})`,
        code,
        res.status ? { status: res.status } : undefined,
      );
    }

    const emitter = new BlockEmitter();
    let finishReason: string | undefined;
    try {
      for await (const json of sseChunks(res.body)) {
        const chunk = json as OpenAiChunk;
        if (chunk.error) {
          throw new LlmError(chunk.error.message ?? 'llama.cpp error', pickFailureCode(chunk.error.message ?? '', 0));
        }
        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta ?? {};
          if (delta.content) emitter.feedText(delta.content);
          if (delta.reasoning_content) emitter.feedReasoning(delta.reasoning_content);
          for (const tc of delta.tool_calls ?? []) emitter.feedTool(tc);
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
        if (chunk.usage) emitter.noteUsage(chunk.usage);
        for (const out of emitter.take()) yield out;
      }
    } catch (err) {
      if (options.signal?.aborted || controller.signal.aborted) {
        throw new LlmError('aborted by caller', 'ABORTED');
      }
      throw err;
    }

    for (const out of emitter.finish(finishReason ?? 'stop')) yield out;
  }
}

/** 行缓冲 SSE 解析：data: <json>；[DONE] 终止。 */
async function* sseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') return;
        yield JSON.parse(payload);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function pickFailureCode(detail: string, status: number): string {
  if (isContextWindowExceededError(detail)) return 'CONTEXT_WINDOW_EXCEEDED';
  if (isQuotaExceededError(detail)) return 'QUOTA';
  if (status === 401 || status === 403) return 'AUTH';
  if (status >= 500 || status === 429) return 'RATE_LIMIT';
  return 'REQUEST_FAILED';
}

function buildWireMessages(options: GenerateOptions): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (options.system) out.push({ role: 'system', content: options.system });
  for (const msg of options.messages) out.push(...translateMessage(msg as unknown as MessageLike));
  return out;
}

/** 翻译一条 DSH Message → OpenAI 消息（可能是 0..n 条）。 */
function translateMessage(msg: MessageLike): Array<Record<string, unknown>> {
  if (msg.role === 'system') {
    return [{ role: 'system', content: textOf(msg.content) }];
  }
  if (msg.role === 'user') {
    if (msg.source?.kind === 'tool') {
      const block = msg.content.find((c) => c.type === 'tool-result');
      if (block) {
        return [{
          role: 'tool',
          tool_call_id: block.toolCallId ?? '',
          content: block.isError
            ? `[error]\n${textOf(block.content ?? [])}`
            : textOf(block.content ?? []),
        }];
      }
      return [{ role: 'user', content: textOf(msg.content) }];
    }
    rejectImages(msg);
    return [{ role: 'user', content: textOf(msg.content) }];
  }
  // assistant
  const text = textOf(msg.content);
  const calls = msg.content.filter((c) => c.type === 'tool-call');
  const wire: Record<string, unknown> = { role: 'assistant' };
  if (text) wire.content = text;
  if (calls.length > 0) {
    wire.tool_calls = calls.map((c) => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: c.arguments },
    }));
  }
  return [wire];
}

function rejectImages(msg: MessageLike): void {
  if (msg.content.some((c) => c.type === 'image')) {
    throw new LlmError('llama.cpp route is text-only; image content is unsupported', 'UNSUPPORTED_MODALITY');
  }
}

function textOf(blocks: readonly BlockLike[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
  }
  return parts.join('\n');
}

/**
 * 把 SSE delta 流聚合成 StreamChunk。
 * 块索引自管：text 块永远先分配（若出现），reasoning 其次，tool-call 按
 * OpenAI 的 tool index 映射到各自块。usage 在收尾 finish 之前发出。
 */
class BlockEmitter {
  private nextIndex = 0;
  private textStarted = false;
  private textAcc = '';
  private reasonStarted = false;
  private reasonAcc = '';
  private readonly toolBlocks = new Map<number, { block: number; id?: string; name: string; args: string }>();
  private usageSent = false;
  private pending: StreamChunk[] = [];

  feedText(delta: string): void {
    if (!this.textStarted) {
      this.textStarted = true;
      this.push({ type: 'block-start', index: this.nextIndex++, blockType: 'text' });
    }
    this.textAcc += delta;
    this.push({ type: 'text-delta', index: this.textIndex(), text: delta });
  }
  private textIndex(): number {
    return 0;
  }

  feedReasoning(delta: string): void {
    if (!this.reasonStarted) {
      this.reasonStarted = true;
      this.push({ type: 'block-start', index: this.nextIndex++, blockType: 'reasoning' });
    }
    this.reasonAcc += delta;
    this.push({ type: 'reasoning-delta', index: this.reasonIndex(), text: delta });
  }
  private reasonIndex(): number {
    return this.textStarted ? 1 : 0;
  }

  feedTool(tc: OpenAiDeltaToolCall): void {
    const idx = tc.index ?? 0;
    let entry = this.toolBlocks.get(idx);
    if (!entry) {
      entry = { block: this.nextIndex++, name: '', args: '' };
      this.toolBlocks.set(idx, entry);
      this.push({ type: 'block-start', index: entry.block, blockType: 'tool-call' });
    }
    if (tc.id) entry.id = tc.id;
    if (tc.function?.name) entry.name = tc.function.name;
    const argDelta = tc.function?.arguments ?? '';
    if (argDelta) entry.args += argDelta;
    this.push({
      type: 'tool-call-delta',
      index: entry.block,
      id: callId(entry.id, entry.block) as never,
      name: tc.function?.name,
      argumentsDelta: argDelta,
    });
  }

  noteUsage(u: { prompt_tokens?: number; completion_tokens?: number }): void {
    if (this.usageSent) return;
    this.usageSent = true;
    this.push({
      type: 'usage',
      usage: { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 },
    });
  }

  take(): StreamChunk[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  finish(reason: string): StreamChunk[] {
    const out: StreamChunk[] = [];
    if (this.textStarted) {
      out.push({ type: 'block-end', index: this.textIndex(), block: { type: 'text', text: this.textAcc } });
    }
    if (this.reasonStarted) {
      out.push({ type: 'block-end', index: this.reasonIndex(), block: { type: 'reasoning', text: this.reasonAcc } });
    }
    for (const [idx, t] of [...this.toolBlocks.entries()].sort((a, b) => a[0] - b[0])) {
      out.push({
        type: 'block-end',
        index: t.block,
        block: { type: 'tool-call', id: callId(t.id, idx) as never, name: t.name, arguments: t.args },
      });
    }
    if (!this.usageSent) {
      out.push({ type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } });
    }
    const hasContent = this.textStarted || this.reasonStarted || this.toolBlocks.size > 0;
    if (!hasContent && reason === 'stop') {
      out.push({
        type: 'finish',
        reason: { kind: 'error', failure: { message: 'empty response', code: 'EMPTY_RESPONSE' } },
      });
      return out;
    }
    const finish =
      reason === 'tool_calls'
        ? ({ kind: 'tool-calls' } as const)
        : reason === 'length'
          ? ({ kind: 'max-tokens' } as const)
          : ({ kind: 'stop' } as const);
    out.push({ type: 'finish', reason: finish });
    return out;
  }

  private push(chunk: StreamChunk): void {
    this.pending.push(chunk);
  }
}

/** OpenAI 未给 tool_call id 时生成稳定的本地 id。 */
function callId(existing: string | undefined, block: number): string {
  return existing ?? `call_${block}`;
}
