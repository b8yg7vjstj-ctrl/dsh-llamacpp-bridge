/**
 * 「llama.cpp 终端输出监控」面板（中心列）。
 *
 * 设计参考 @linxin666/dsh-client-ui-task-board：
 *  - 挂载方式：侧边栏入口行（DOM 锚点 + MutationObserver 自愈，插在“新会话”按钮
 *    下方的插件行区域，与任务看板同级）+ 中心列面板容器（createRoot）。
 *  - 数据面：同源 HTTP + SSE（`/api/llamacpp-bridge/state`、`/events`），
 *    不依赖 cordis 事件白名单。
 *  - 面板顶部先给「插件作用回显」，再进入状态输出（Deep Diving）。
 */

import * as React from 'react';
import { TERMINAL_PANEL_LABEL, TERMINAL_ROUTE_PREFIX, truncateModelName } from '../shared';

export interface LogEntryLike {
  seq: number;
  ts: number;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

export interface TerminalStatusLike {
  phase: 'idle' | 'starting' | 'running' | 'stopping' | 'error';
  modelId?: string;
  pid?: number;
  mode?: 'single' | 'router';
  contextLength?: number;
  loaded?: readonly string[];
  error?: string;
}

interface SnapshotLike {
  provider: string;
  purpose: string[];
  status: TerminalStatusLike;
  models: readonly { id: string; name: string; mmproj?: boolean }[];
  lastSeq: number;
  log: LogEntryLike[];
}

const PHASE_TEXT: Record<string, string> = {
  idle: '未运行',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  error: '错误',
};

const PHASE_COLOR: Record<string, string> = {
  idle: '#9e9e9e',
  starting: '#f0b429',
  running: '#4caf50',
  stopping: '#f0b429',
  error: '#e5484d',
};

const STREAM_COLOR: Record<string, string> = {
  stdout: 'inherit',
  stderr: '#e5a04d',
  system: '#7aa2f7',
};

const mono: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  lineHeight: 1.5,
};

/** 拉一次快照。 */
async function fetchSnapshot(): Promise<SnapshotLike | null> {
  try {
    const res = await fetch(`${TERMINAL_ROUTE_PREFIX}/state`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SnapshotLike;
  } catch {
    return null;
  }
}

/**
 * 视图组件 props：会话作用域的标准 props（sessionId / useSession / useProjection 等）
 * 由壳注入；本面板只消费自己的同源数据面，故全部可选并忽略。
 */
/* ---------- 模型切换（由 DOM 入口行打开的面板内联，替代原先的 footer 入口） ---------- */

export interface ObservableSnapshot<T> {
  getSnapshot(): T;
  subscribe(fn: () => void): () => void;
}

export interface SettingsScopeSnapshotLike {
  status: 'loading' | 'ready' | 'unavailable';
  value: Record<string, unknown> | undefined;
  writable: boolean;
}

export interface SettingsScopeLike {
  getSnapshot(): SettingsScopeSnapshotLike;
  subscribe(fn: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
  unset(field: string): Promise<void>;
}

interface DirectoryState {
  current: { provider: string; model: string } | null;
  groups: { id: string; name: string; models: { id: string; name: string; description?: string }[] }[];
  status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error';
  error: string | null;
}

export interface ModelDirectoryLike {
  store: ObservableSnapshot<DirectoryState>;
  load(): Promise<unknown>;
  select(selection: { provider: string; model: string }): Promise<void>;
}

export interface PanelProps {
  [key: string]: unknown;
  /** 关闭面板并回到会话（由挂载器注入）。 */
  onClose?: () => void;
  /** 会话作用域标准 prop：本面板据此解析模型目录。 */
  sessionId?: string;
  /** 会话列表快照（DOM 挂载时由 index.tsx 注入，用于取当前会话 id）。 */
  sessionList?: ObservableSnapshot<{ current?: string }>;
  /** 每次面板打开递增：驱动模型目录重新加载。 */
  openNonce?: number;
  /** 由 index.tsx 注入：会话 → 模型目录。 */
  directoryFor?: (sessionId: string) => ModelDirectoryLike | null;
  /** 由 index.tsx 注入：插件设置命名空间（用于“未配置”引导提示）。 */
  settings?: SettingsScopeLike | null;
}

/** 模型切换区：列出 llamacpp 分组模型，点击即切换（下次发送生效）。 */
function ModelSwitcher(props: {
  sessionId?: string;
  sessionList?: ObservableSnapshot<{ current?: string }>;
  directoryFor?: (sessionId: string) => ModelDirectoryLike | null;
  settings?: SettingsScopeLike | null;
  openNonce?: number;
}) {
  const { directoryFor, settings, sessionList } = props;
  // 会话 id：优先用标准 prop；DOM 挂载场景下从会话快照取当前会话。
  const currentFromList = React.useSyncExternalStore<string | undefined>(
    sessionList ? (cb) => sessionList.subscribe(cb) : () => () => {},
    sessionList ? () => sessionList.getSnapshot().current : () => undefined,
  );
  const sessionId = props.sessionId ?? currentFromList;
  const [dir, setDir] = React.useState<ModelDirectoryLike | null>(null);

  React.useEffect(() => {
    if (!directoryFor || !sessionId) {
      setDir(null);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const tryResolve = () => {
      const next = directoryFor(sessionId);
      if (!next) {
        timer = window.setTimeout(tryResolve, 500);
        return;
      }
      if (cancelled) return;
      setDir(next);
      next.load().catch(() => {
        /* 失败保留上次可用分组 */
      });
    };
    tryResolve();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // openNonce 变化（每次打开面板）→ 重新解析并 load，确保列表反映磁盘现状。
  }, [directoryFor, sessionId, props.openNonce]);

  const state = React.useSyncExternalStore<DirectoryState | null>(
    dir ? (cb) => dir.store.subscribe(cb) : () => () => {},
    dir ? () => dir.store.getSnapshot() : () => null,
  );
  const settingsSnapshot = React.useSyncExternalStore<SettingsScopeSnapshotLike | null>(
    settings ? (cb) => settings.subscribe(cb) : () => () => {},
    settings ? () => settings.getSnapshot() : () => null,
  );

  const group = state?.groups.find((g) => g.id === 'llamacpp') ?? null;
  const current = state?.current?.provider === 'llamacpp' ? state.current.model : null;
  const modelsDir = settingsSnapshot?.value?.['modelsDir'];

  if (!group || group.models.length === 0) {
    return (
      <div style={{ margin: '0 14px 8px', fontSize: 12, opacity: 0.75 }}>
        {state?.status === 'loading' || !state
          ? '模型目录加载中…'
          : '未发现 llamacpp 模型：请在 设置 → llama.cpp 中选择模型目录。'}
      </div>
    );
  }

  return (
    <div style={{ margin: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>模型：</span>
      {group.models.map((m) => {
        const active = current === m.id;
        const vision = (m.description ?? '').toLowerCase().includes('mmproj');
        return (
          <button
            key={m.id}
            type="button"
            title={`${m.id}${m.description ? ` · ${m.description}` : ''}`}
            disabled={state?.status === 'selecting'}
            onClick={() => {
              void dir?.select({ provider: 'llamacpp', model: m.id }).catch(() => {});
            }}
            style={{
              padding: '3px 8px',
              borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))',
              background: active ? 'rgba(64,120,255,.18)' : 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            {/* 显示名超过 30 字符时截断加省略号；完整 id 在 title 里 */}
            {vision ? '👁 ' : ''}
            {truncateModelName(m.name)}
            {active ? ' ✓' : ''}
          </button>
        );
      })}
      <button
        type="button"
        title="重新扫描模型目录"
        onClick={() => {
          void dir?.load().catch(() => {});
        }}
        style={{
          padding: '3px 8px',
          borderRadius: 6,
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'inherit',
        }}
      >
        刷新
      </button>
      {!modelsDir && (
        <span style={{ fontSize: 11, opacity: 0.7 }}>（未配置模型目录：设置 → llama.cpp）</span>
      )}
    </div>
  );
}

export function LlamaCppTerminalPanel(props: PanelProps) {
  const [snapshot, setSnapshot] = React.useState<SnapshotLike | null>(null);
  const [log, setLog] = React.useState<LogEntryLike[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [follow, setFollow] = React.useState(true);
  const [filter, setFilter] = React.useState('');
  const [stopping, setStopping] = React.useState(false);
  const [stopMessage, setStopMessage] = React.useState<string | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);

  // 初始快照 + SSE 实时流（断线自动重连，用 lastSeq 增量补发）。
  React.useEffect(() => {
    let closed = false;
    let es: EventSource | null = null;
    let retry: number | undefined;
    let lastSeq = 0;

    const mergeLog = (entries: LogEntryLike[]) => {
      if (entries.length === 0) return;
      setLog((prev) => {
        const seen = new Set(prev.map((e) => e.seq));
        const merged = [...prev, ...entries.filter((e) => !seen.has(e.seq))];
        merged.sort((a, b) => a.seq - b.seq);
        return merged.slice(-2000);
      });
      for (const e of entries) lastSeq = Math.max(lastSeq, e.seq);
    };

    const connect = () => {
      if (closed) return;
      try {
        es = new EventSource(`${TERMINAL_ROUTE_PREFIX}/events`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      es.addEventListener('open', () => {
        setConnected(true);
        setError(null);
      });
      es.addEventListener('snapshot', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as SnapshotLike;
          setSnapshot(data);
          setLog(data.log ?? []);
          lastSeq = data.lastSeq ?? 0;
        } catch {
          /* 忽略坏帧 */
        }
      });
      es.addEventListener('log', (ev) => {
        try {
          mergeLog([JSON.parse((ev as MessageEvent).data) as LogEntryLike]);
        } catch {
          /* 忽略坏帧 */
        }
      });
      es.addEventListener('status', (ev) => {
        try {
          const st = JSON.parse((ev as MessageEvent).data) as TerminalStatusLike;
          setSnapshot((prev) => (prev ? { ...prev, status: st } : prev));
        } catch {
          /* 忽略坏帧 */
        }
      });
      es.addEventListener('error', () => {
        setConnected(false);
        es?.close();
        es = null;
        // 重连：先用快照补齐可能错过的增量，再重开 SSE
        retry = window.setTimeout(() => {
          void fetchSnapshot().then((snap) => {
            if (closed || !snap) return;
            setSnapshot(snap);
            const missed = (snap.log ?? []).filter((e) => e.seq > lastSeq);
            mergeLog(missed);
            connect();
          });
        }, 1500);
      });
    };

    void fetchSnapshot().then((snap) => {
      if (closed || !snap) return;
      setSnapshot(snap);
      setLog(snap.log ?? []);
      lastSeq = snap.lastSeq ?? 0;
      connect();
    });

    return () => {
      closed = true;
      if (retry !== undefined) window.clearTimeout(retry);
      es?.close();
    };
  }, []);

  // 自动滚底
  React.useEffect(() => {
    if (!follow) return;
    const el = viewRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, follow]);

  /** 优雅退出：Ctrl+C（SIGINT）→ 发送 Y 确认 → 等退出；不走直杀路线。 */
  const gracefulStop = async () => {
    setStopping(true);
    setStopMessage('正在发送 Ctrl+C …');
    try {
      const res = await fetch(`${TERMINAL_ROUTE_PREFIX}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'graceful-stop' }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; steps?: string[]; error?: string };
      if (!res.ok || body.ok === false) {
        setStopMessage(`失败：${body.error ?? `HTTP ${res.status}`}`);
      } else {
        setStopMessage(`已完成：${(body.steps ?? []).join(' → ')}`);
      }
    } catch (e) {
      setStopMessage(`失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStopping(false);
    }
  };

  const status = snapshot?.status;
  const phase = status?.phase ?? 'idle';
  const shown = filter
    ? log.filter((e) => e.text.toLowerCase().includes(filter.toLowerCase()))
    : log;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        fontSize: 13,
        color: 'var(--dsw-alias-label-primary, inherit)',
      }}
    >
      {/* 标题 + 状态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 6px' }}>
        <button
          type="button"
          onClick={() => props.onClose?.()}
          title="返回会话"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'inherit',
            flex: 'none',
          }}
        >
          ← 返回会话
        </button>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: PHASE_COLOR[phase] ?? '#9e9e9e',
            flex: 'none',
          }}
        />
        <strong style={{ fontSize: 14 }}>{TERMINAL_PANEL_LABEL}</strong>
        <span style={{ opacity: 0.7 }}>{PHASE_TEXT[phase] ?? phase}</span>
        {status?.modelId && <span style={{ opacity: 0.85 }}>· 模型 {status.modelId}</span>}
        {status?.pid !== undefined && <span style={{ opacity: 0.6 }}>· pid {status.pid}</span>}
        {status?.mode && <span style={{ opacity: 0.6 }}>· {status.mode}</span>}
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 11 }}>
          {connected ? '实时连接中（SSE）' : '未连接（重试中）'}
        </span>
      </div>

      <ModelSwitcher
        sessionId={props.sessionId}
        sessionList={props.sessionList}
        directoryFor={props.directoryFor}
        settings={props.settings}
        openNonce={props.openNonce}
      />

      {status?.error && (
        <div style={{ margin: '0 14px 6px', color: '#e5484d', fontSize: 12 }}>{status.error}</div>
      )}

      {/* 插件作用回显（在状态输出之前） */}
      <div
        style={{
          margin: '0 14px 8px',
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.28))',
          background: 'var(--dsw-alias-surface-l2, rgba(0,0,0,.03))',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2 }}>插件作用回显</div>
        {(snapshot?.purpose ?? []).map((line, i) => (
          <div key={i} style={{ opacity: 0.85 }}>
            · {line}
          </div>
        ))}
        {!snapshot && <div style={{ opacity: 0.7 }}>正在获取快照…</div>}
      </div>

      {/* 工具条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 6px' }}>
        <input
          value={filter}
          placeholder="过滤输出…"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
          style={{
            flex: 1,
            maxWidth: 260,
            padding: '4px 8px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))',
            background: 'transparent',
            color: 'inherit',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={follow}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFollow(e.target.checked)}
          />
          自动滚动
        </label>
        <button
          type="button"
          onClick={() => void gracefulStop()}
          disabled={stopping || phase === 'idle' || phase === 'stopping'}
          title="向 llama-server 发送 Ctrl+C（SIGINT），随后发送 Y 确认退出；不使用强杀"
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))',
            background: 'transparent',
            color: 'inherit',
            cursor: stopping ? 'default' : 'pointer',
            opacity: stopping || phase === 'idle' || phase === 'stopping' ? 0.5 : 1,
            fontSize: 12,
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          {stopping ? '退出中…' : '优雅退出（Ctrl+C → Y）'}
        </button>
        <button
          type="button"
          onClick={() => {
            setLog([]);
          }}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'inherit',
          }}
        >
          清屏（仅本地视图）
        </button>
        <span style={{ opacity: 0.6, fontSize: 11 }}>
          {shown.length} 行{filter ? ` / 共 ${log.length}` : ''}
        </span>
      </div>

      {stopMessage && (
        <div style={{ margin: '0 14px 6px', fontSize: 12, opacity: 0.85 }}>{stopMessage}</div>
      )}
      {error && <div style={{ margin: '0 14px 6px', color: '#e5484d', fontSize: 12 }}>{error}</div>}

      {/* 终端输出 */}
      <div
        ref={viewRef}
        style={{
          ...mono,
          flex: 1,
          minHeight: 120,
          margin: '0 14px 14px',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.28))',
          background: 'var(--dsw-alias-surface-l2, rgba(0,0,0,.06))',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {shown.length === 0 ? (
          <div style={{ opacity: 0.6 }}>
            {connected
              ? '暂无输出。选择 llama.cpp 模型并发送消息后，这里会显示 llama-server 的启动与推理日志。'
              : '正在连接 host 数据面…'}
          </div>
        ) : (
          shown.map((e) => (
            <div key={e.seq} style={{ display: 'flex', gap: 8 }}>
              <span style={{ opacity: 0.45, flex: 'none' }}>
                {new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
              <span
                style={{
                  flex: 'none',
                  width: 52,
                  opacity: 0.6,
                  color: STREAM_COLOR[e.stream] ?? 'inherit',
                }}
              >
                {e.stream}
              </span>
              <span style={{ color: STREAM_COLOR[e.stream] ?? 'inherit' }}>{e.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
