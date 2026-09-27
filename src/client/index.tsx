/**
 * llama.cpp Bridge —— client 端（浏览器）入口。
 *
 * 装载契约（实测得出，务必保持）：
 * - 导出 `inject` 与 `apply(ctx)`；bundle 由 esbuild 打成
 *   `window.__ModuleLoader__.load({ id, factory })`（见 scripts/wrap-client.mjs）。
 * - `inject` 只列**必然存在的核心服务**（slots / sessions）：未声明的服务属性访问会抛
 *   `cannot get property "X" without inject`；而声明了当前作用域拿不到的服务，
 *   fiber 会永久等待 → 插件静默不生效。可选服务一律走 `ctx.inject([...], cb)` 局部等待。
 * - list 类座位（sidebar.footer.action / settings.section / conversation.view）注册时
 *   `id` 必填。
 *
 * 功能（**只有一个 UI 入口**，按用户要求）：
 *  ① DOM 注入的侧边栏入口行（与任务看板同级、线条终端图标）—— 唯一入口；
 *  ② 点击后展开自持面板（createRoot 挂会话列；激活时隐藏会话列其它子元素避免重叠；
 *     头部「← 返回会话」、点会话行、Esc 三种收起方式；与其它面板互斥）；
 *  ③ 该面板内联模型切换（列出 llamacpp 模型，点击即切换）+ 终端实时输出；
 *  ④ 设置页「llama.cpp」（settings.section，位于设置内，不是侧边栏入口）：图形化引导。
 *  已移除：sidebar.footer.action 上的「llama.cpp」面板（曾造成两个入口）。
 */

import * as React from 'react';
import {
  type ModelDirectoryLike,
  type ObservableSnapshot,
  type SettingsScopeLike,
} from './terminal-panel';
import { LlamaCppSettingsSection } from './setup';
import { mountTerminalPanel } from './terminal-mount';
import { DISCOVERY_NS, SETTINGS_NS, TERMINAL_PANEL_LABEL } from '../shared';

/** 只列核心服务；其余用 ctx.inject 局部等待。 */
export const inject = ['slots', 'sessions'];

/** 设置页/目录浏览所需的 workspaces 形状（按存在性探测）。 */
interface WorkspacesLike {
  listDirectory?(path?: string, signal?: AbortSignal): Promise<unknown>;
  createDirectory?(path: string, name: string): Promise<unknown>;
  pickDirectory?(): Promise<string | null>;
}

/** 会话列表快照状态（ctx.sessions.list）。 */
interface SessionListState {
  current: string | undefined;
  ids: string[];
}

/** 客户端可选服务的持有槽（由 ctx.inject 回调填充）。 */
interface OptionalServices {
  modelDirectories: { directoryFor(id: string): ModelDirectoryLike } | null;
  settings: SettingsScopeLike | null;
  discovery: SettingsScopeLike | null;
  workspaces: WorkspacesLike | null;
}

export function apply(ctx: any): void {
  /** 读取服务：未声明/未提供/守卫抛错一律降级为 null。 */
  const safeGet = <T,>(key: string): T | null => {
    try {
      return ((ctx as Record<string, unknown>)[key] ?? null) as T | null;
    } catch {
      return null;
    }
  };

  // ctx.sessions 是服务；快照挂在 ctx.sessions.list 上（传服务本身会崩）。
  const sessionsService = safeGet<{
    list?: ObservableSnapshot<SessionListState>;
  }>('sessions');
  const sessions = sessionsService?.list ?? null;
  const slots = safeGet<{
    inject(name: string, cb: () => () => void): () => void;
    register(options: Record<string, unknown>, Component: unknown): () => void;
  }>('slots');
  if (!slots) {
    console.warn('[llamacpp-bridge] slots 服务不可用：客户端 UI 未注册');
    return;
  }

  /* ---------- 可选服务：局部注入等待 ---------- */
  const optional: OptionalServices = {
    modelDirectories: null,
    settings: null,
    discovery: null,
    workspaces: null,
  };

  const injectOptional = (ctx as { inject?: (names: string[], cb: (scope: any) => void) => void }).inject;
  if (typeof injectOptional === 'function') {
    injectOptional.call(ctx, ['modelDirectories', 'settingsScope', 'workspaces'], (scope: any) => {
      const get = <T,>(key: string): T | null => {
        try {
          return (scope[key] ?? null) as T | null;
        } catch {
          return null;
        }
      };
      optional.modelDirectories = get('modelDirectories');
      optional.workspaces = get('workspaces');
      const binder = get<{ bind(spec: { namespace: string }): SettingsScopeLike }>('settingsScope');
      try {
        optional.settings = binder ? binder.bind({ namespace: SETTINGS_NS }) : null;
      } catch {
        optional.settings = null;
      }
      try {
        optional.discovery = binder ? binder.bind({ namespace: DISCOVERY_NS }) : null;
      } catch {
        optional.discovery = null;
      }
      registerSettingsSection(scope ?? ctx, optional);
    });
  } else {
    // 极端降级：没有 ctx.inject 时仍注册设置页（服务可能为空，面板会自行降级）。
    registerSettingsSection(ctx, optional);
  }

  /* ---------- 唯一的 UI 入口：DOM 注入的侧边栏入口行（自持面板，照任务看板做法） ---------- */
  // 入口行自己开关面板，不依赖原生标签：原生标签只在「已打开会话且标签数 > 1」时渲染，
  // 在 hero/首页点击会找不到目标 → 表现为「点不动」。面板自带「← 返回会话」，
  // 点侧边栏会话行或 Esc 同样收起，并与其它面板互斥（dsh-panel-activate）。
  const directoryFor = (sessionId: string): ModelDirectoryLike | null => {
    const dirs = optional.modelDirectories;
    if (!dirs) return null;
    try {
      return dirs.directoryFor(sessionId);
    } catch {
      return null; // 会话尚未具备模型 RPC 作用域
    }
  };

  try {
    const mount = mountTerminalPanel({
      directoryFor,
      settings: optional.settings,
      sessionList: sessions ?? undefined,
    });
    ctx.effect(() => () => mount.dispose());
  } catch (err) {
    console.warn('[llamacpp-bridge] terminal panel mount failed:', err);
  }
}


function registerSettingsSection(scope: any, optional: OptionalServices): void {
  try {
    const slots = scope.slots as {
      inject(name: string, cb: () => () => void): () => void;
      register(options: Record<string, unknown>, Component: unknown): () => void;
    };
    slots.inject('settings.section', () =>
      slots.register(
        {
          name: 'settings.section',
          id: 'llamacpp',
          order: 12,
          label: () => 'llama.cpp',
          inject: () => ({
            settings: optional.settings,
            discovery: optional.discovery,
            workspaces: optional.workspaces,
          }),
        },
        LlamaCppSettingsSection,
      ),
    );
  } catch (err) {
    console.warn('[llamacpp-bridge] settings section registration failed:', err);
  }
}
