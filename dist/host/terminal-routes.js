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
import { PLUGIN_PURPOSE_LINES, PROVIDER_ID, TERMINAL_ROUTE_PREFIX } from '../shared.js';
/** 动作请求体上限（字节）。 */
const MAX_ACTION_BODY = 64 * 1024;
/** 读取 JSON 请求体（带大小上限）。 */
function readBody(req, limit = MAX_ACTION_BODY) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error('body-too-large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8').trim();
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            }
            catch {
                reject(new Error('invalid-json'));
            }
        });
        req.on('error', reject);
    });
}
const HEARTBEAT_MS = 15_000;
/* ---------------- 信任栅栏（与看板同法） ---------------- */
/** 127/8、::1 与 IPv4-mapped 形式都算 loopback。 */
function isLoopbackAddress(address) {
    if (!address)
        return false;
    const a = address.startsWith('::ffff:') ? address.slice(7) : address;
    if (a === '::1' || a === 'localhost')
        return true;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
    return m?.[1] === '127';
}
function isLoopbackHostname(host) {
    if (!host)
        return false;
    const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    return name === 'localhost' || name === '::1' || name.startsWith('127.');
}
function browserSameOriginMarker(req) {
    if (req.headers['sec-fetch-site'] === 'same-origin')
        return true;
    const origin = req.headers.origin;
    if (typeof origin !== 'string')
        return false;
    try {
        return isLoopbackHostname(new URL(origin).host);
    }
    catch {
        return false;
    }
}
/**
 * 信任判定：loopback socket + loopback Host 头 + 浏览器同源标记。
 * 与看板一致——socket/Host/origin 三者共同承担权威，标记只是绊线。
 */
function isTrusted(req) {
    if (!isLoopbackAddress(req.socket.remoteAddress ?? undefined))
        return false;
    const host = req.headers.host;
    if (!isLoopbackHostname(host))
        return false;
    return browserSameOriginMarker(req);
}
function writeJson(res, code, value) {
    const body = JSON.stringify(value);
    res.writeHead(code, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
    });
    res.end(body);
}
/* ---------------- 路由 ---------------- */
export function makeTerminalRoutes(deps) {
    const { logs, source } = deps;
    const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
    const snapshot = () => ({
        provider: PROVIDER_ID,
        purpose: source.purpose(),
        status: source.status(),
        models: source.models().map((m) => ({ id: m.id, name: m.name, mmproj: Boolean(m.mmproj) })),
        lastSeq: logs.lastSeq,
        log: logs.tail(400),
    });
    const guard = (req, res) => {
        if (isTrusted(req))
            return true;
        writeJson(res, 403, { ok: false, error: 'forbidden' });
        return false;
    };
    return [
        {
            kind: 'exact',
            path: `${TERMINAL_ROUTE_PREFIX}/action`,
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
                    return;
                }
                if (!guard(req, res))
                    return;
                if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
                    writeJson(res, 415, { ok: false, error: 'json-required' });
                    return;
                }
                try {
                    const body = (await readBody(req));
                    const action = typeof body.action === 'string' ? body.action : '';
                    if (action === 'graceful-stop') {
                        if (!deps.actions?.gracefulStop) {
                            writeJson(res, 501, { ok: false, error: 'action-unavailable' });
                            return;
                        }
                        const result = await deps.actions.gracefulStop();
                        writeJson(res, 200, { ok: result.ok, steps: result.steps });
                        return;
                    }
                    writeJson(res, 400, { ok: false, error: 'unknown-action' });
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    writeJson(res, message === 'body-too-large' ? 413 : 400, { ok: false, error: message });
                }
            },
        },
        {
            kind: 'exact',
            path: `${TERMINAL_ROUTE_PREFIX}/state`,
            handler: (req, res) => {
                if (req.method !== 'GET') {
                    writeJson(res, 405, { ok: false, error: 'method-not-allowed' });
                    return;
                }
                if (!guard(req, res))
                    return;
                writeJson(res, 200, snapshot());
            },
        },
        {
            kind: 'exact',
            path: `${TERMINAL_ROUTE_PREFIX}/events`,
            handler: (req, res) => {
                if (req.method !== 'GET') {
                    res.writeHead(405);
                    res.end();
                    return;
                }
                if (!guard(req, res))
                    return;
                res.writeHead(200, {
                    'content-type': 'text/event-stream; charset=utf-8',
                    'cache-control': 'no-cache, no-store',
                    connection: 'keep-alive',
                    'x-accel-buffering': 'no',
                });
                const send = (event, data) => {
                    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
                };
                // 首帧：完整快照（含作用回显 + 尾部日志），便于刷新/重连即见内容。
                send('snapshot', snapshot());
                // 增量：日志行
                const unsubscribeLogs = logs.subscribe((entry) => {
                    send('log', entry);
                });
                // 增量：状态（起服/就绪/停止/错误）—— 由 source.status 轮询差异推送。
                let lastStatus = JSON.stringify(source.status());
                const statusTimer = setInterval(() => {
                    const next = JSON.stringify(source.status());
                    if (next !== lastStatus) {
                        lastStatus = next;
                        send('status', source.status());
                    }
                }, 1000);
                const heartbeat = setInterval(() => {
                    res.write(`: ping ${Date.now()}\n\n`);
                }, heartbeatMs);
                const close = () => {
                    clearInterval(heartbeat);
                    clearInterval(statusTimer);
                    unsubscribeLogs();
                };
                req.once('close', close);
                res.once('close', close);
            },
        },
    ];
}
/** 面板首屏“插件作用回显”。 */
export function purposeLines() {
    return [...PLUGIN_PURPOSE_LINES];
}
//# sourceMappingURL=terminal-routes.js.map