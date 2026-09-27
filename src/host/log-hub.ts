/**
 * 日志总线：llama-server 的 stdout/stderr 与插件自身状态行统一进入环形缓冲，
 * 供「llama.cpp 终端输出监控」面板通过同源 SSE 实时回传。
 *
 * 与 dsh-subprocess 的 collect 读取器解耦：管理器只负责 append，总线负责
 * 序号（seq）、环形上限与订阅广播，SSE 断线重连可按 seq 增量补发。
 */

import { LOG_TAIL_LINES } from '../shared.js';

export type LogStream = 'stdout' | 'stderr' | 'system' | 'terminal';

export interface LogEntry {
  /** 单调递增序号（SSE 增量补发的游标）。 */
  seq: number;
  /** Unix 毫秒时间戳。 */
  ts: number;
  stream: LogStream;
  text: string;
}

export class LogHub {
  private ring: LogEntry[] = [];
  private seq = 0;
  private readonly listeners = new Set<(entry: LogEntry) => void>();
  private readonly limit: number;

  constructor(limit = LOG_TAIL_LINES) {
    this.limit = limit;
  }

  /** 追加一行。 */
  append(stream: LogStream, text: string): LogEntry {
    this.seq += 1;
    const entry: LogEntry = { seq: this.seq, ts: Date.now(), stream, text };
    this.ring.push(entry);
    if (this.ring.length > this.limit) this.ring.splice(0, this.ring.length - this.limit);
    for (const fn of [...this.listeners]) {
      try {
        fn(entry);
      } catch {
        /* 单个订阅者异常不影响其它订阅者 */
      }
    }
    return entry;
  }

  /** 批量追加（每行一条）。 */
  appendLines(stream: LogStream, lines: readonly string[]): void {
    for (const line of lines) this.append(stream, line);
  }

  /** 最近 n 条（新条目在后）。 */
  tail(n = 200): LogEntry[] {
    return n >= this.ring.length ? [...this.ring] : this.ring.slice(-n);
  }

  /** 序号大于 since 的条目（SSE 重连补发）。 */
  since(seq: number): LogEntry[] {
    return this.ring.filter((e) => e.seq > seq);
  }

  get lastSeq(): number {
    return this.seq;
  }

  subscribe(fn: (entry: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  clear(): void {
    this.ring = [];
  }

  dispose(): void {
    this.listeners.clear();
    this.ring = [];
  }
}
