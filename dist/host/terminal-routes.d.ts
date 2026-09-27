/**
 * 「llama.cpp 终端输出监控」的 host 侧数据面。
 *
 * 参考 @linxin666/dsh-client-ui-task-board 的做法：用官方
 * `ctx.webServer.register({ kind, path, handler })` 挂同源 HTTP 路由，
 * 事件流用 SSE（`text/event-stream` + 心跳 + `req/res close` 清理），
 * 并带 loopback socket + loopback Host + 浏览器同源标记的信任栅栏。
 *
 * 路由（前缀 /api/llamacpp-bridge）：
 *   GET  /api/llamacpp-bridge/state   —— 一次性快照（状态 + 尾部日志 + 作用回显）
 *   GET  /api/llamacpp-bridge/events  —— SSE 实时流（日志行 / 状态变更，含心跳）
 *
 * 面板不写数据，因此不提供 POST 动作路由（最小暴露面）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LogHub } from './log-hub.js';
import type { ServerStatus } from './llama-server.js';
export interface TerminalSnapshotSource {
    status(): ServerStatus;
    /** 面板顶部的“插件作用回显”。 */
    purpose(): string[];
    /** 当前已发现模型（供面板显示/切换说明）。 */
    models(): readonly {
        id: string;
        name: string;
        mmproj?: string;
    }[];
}
export interface TerminalRouteDeps {
    logs: LogHub;
    source: TerminalSnapshotSource;
    /** 面板可触发的动作（优雅退出等）。 */
    actions?: {
        /** 优雅退出：Ctrl+C（SIGINT）→ 发送 Y 确认 → 等退出（不直杀）。 */
        gracefulStop(): Promise<{
            ok: boolean;
            steps: string[];
        }>;
    };
    /** SSE 心跳间隔（毫秒）。 */
    heartbeatMs?: number;
}
export declare function makeTerminalRoutes(deps: TerminalRouteDeps): {
    kind: "exact";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void;
}[];
/** 面板首屏“插件作用回显”。 */
export declare function purposeLines(): string[];
