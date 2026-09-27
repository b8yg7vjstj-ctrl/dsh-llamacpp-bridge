/**
 * 日志总线：llama-server 的 stdout/stderr 与插件自身状态行统一进入环形缓冲，
 * 供「llama.cpp 终端输出监控」面板通过同源 SSE 实时回传。
 *
 * 与 dsh-subprocess 的 collect 读取器解耦：管理器只负责 append，总线负责
 * 序号（seq）、环形上限与订阅广播，SSE 断线重连可按 seq 增量补发。
 */
export type LogStream = 'stdout' | 'stderr' | 'system' | 'terminal';
export interface LogEntry {
    /** 单调递增序号（SSE 增量补发的游标）。 */
    seq: number;
    /** Unix 毫秒时间戳。 */
    ts: number;
    stream: LogStream;
    text: string;
}
export declare class LogHub {
    private ring;
    private seq;
    private readonly listeners;
    private readonly limit;
    constructor(limit?: number);
    /** 追加一行。 */
    append(stream: LogStream, text: string): LogEntry;
    /** 批量追加（每行一条）。 */
    appendLines(stream: LogStream, lines: readonly string[]): void;
    /** 最近 n 条（新条目在后）。 */
    tail(n?: number): LogEntry[];
    /** 序号大于 since 的条目（SSE 重连补发）。 */
    since(seq: number): LogEntry[];
    get lastSeq(): number;
    subscribe(fn: (entry: LogEntry) => void): () => void;
    clear(): void;
    dispose(): void;
}
