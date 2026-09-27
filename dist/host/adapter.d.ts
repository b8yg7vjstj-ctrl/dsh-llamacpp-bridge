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
import { LlmAdapter, type GenerateOptions, type LlmModelInfo, type LlmProviderInfo, type LlmResolvedModelInfo, type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { DiscoveredModel } from './model-store.js';
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
export declare class LlamaCppAdapter extends LlmAdapter {
    private readonly deps;
    constructor(deps: LlamaCppAdapterDeps);
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(): undefined;
    listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
