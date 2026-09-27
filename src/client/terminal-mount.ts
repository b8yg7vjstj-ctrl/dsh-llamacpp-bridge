/**
 * DOM 注入的入口行 + 自持面板（完全照 @linxin666/dsh-client-ui-task-board 的做法）。
 *
 * 为什么不用原生 conversation.view 标签：
 * 原生标签只在「已打开会话」且「标签数 > 1」时才渲染，入口行点击去"点标签"在
 * hero/首页场景找不到目标 → 表现为「点不动」。看板的做法是入口行自己持有开合
 * 状态并自己渲染面板，因此任何场景点击都有效。
 *
 * 照搬看板的四个要点：
 *  1) 侧边栏入口行：DOM 锚点插到「新会话」按钮之后、同族插件行之后（与看板同级），
 *     MutationObserver 自愈；
 *  2) 面板：createRoot 挂进会话列，绝对定位 + 注入 CSS；**激活时隐藏会话列其它子元素**
 *     （避免重叠），关闭时移除属性即恢复原生会话；
 *  3) 返回路径齐备：面板头部「← 返回会话」按钮、再点入口行收起、点侧边栏任意会话行收起；
 *  4) 与其它面板互斥：监听 `dsh-panel-activate`，别的面板激活时自动收起。
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OLLAMA_ICON_SVG } from './ollama-icon';
import {
  LlamaCppTerminalPanel,
  type ModelDirectoryLike,
  type SettingsScopeLike,
} from './terminal-panel';
import { TERMINAL_PANEL_LABEL } from '../shared';

const SIDEBAR_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]';
const CONVERSATION_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]';
/** 同族插件行（任务看板等）——本入口排在其后，形成同级并列。 */
const FAMILY_SELECTOR = '[data-dsh-part="sidebar-entry"], [data-dsh-taskboard-entry]';
/** 点击这些行即收起面板（与看板一致）。 */
const SIDEBAR_ROW_SELECTOR =
  '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]';

const ENTRY_ATTR = 'data-dsh-llamacpp-terminal-entry';
const VIEW_ATTR = 'data-dsh-llamacpp-terminal-view';
const ACTIVE_ATTR = 'data-dsh-llamacpp-terminal-active';
const SIBLING_ACTIVE_ATTR = 'data-dsh-taskboard-active';
const ACTIVATE_EVENT = 'dsh-panel-activate';
const PANEL_NAME = 'llamacpp-terminal';

const PANEL_CSS = `
[data-pane="conversation"],[class*="centerCol"]{position:relative}
[${VIEW_ATTR}]{z-index:60;background:var(--dsw-alias-bg-base,Canvas);display:none;position:absolute;inset:0;overflow:hidden;container:dsh-llamacpp/inline-size}
html[${ACTIVE_ATTR}] [${VIEW_ATTR}]{display:block}
html[${ACTIVE_ATTR}] [data-pane="conversation"]>:not([${VIEW_ATTR}]),
html[${ACTIVE_ATTR}] [class*="centerCol"]>:not([${VIEW_ATTR}]){display:none!important}
[${ENTRY_ATTR}]{box-sizing:border-box;width:100%;height:36px;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;white-space:nowrap;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;padding:0 10px;font-size:13px;display:flex;font-family:inherit}
[${ENTRY_ATTR}]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,inherit)}
[${ENTRY_ATTR}][data-active]{background:var(--dsw-alias-interactive-bg-active,rgba(64,120,255,.18));color:var(--dsw-alias-label-primary,inherit);font-weight:600}
[${ENTRY_ATTR}] .dsh-llamacpp-entry-icon{flex:none;justify-content:center;align-items:center;width:24px;height:24px;display:inline-flex}
[${ENTRY_ATTR}] .dsh-llamacpp-entry-icon svg{width:18px;height:18px;display:block}
[${ENTRY_ATTR}] .dsh-llamacpp-entry-label{text-overflow:ellipsis;overflow:hidden}
[data-dsh-frame][data-sidebar-collapsed] [${ENTRY_ATTR}],[data-sidebar-collapsed] [${ENTRY_ATTR}]{border-radius:50%;justify-content:center;width:36px;height:36px;margin:0 auto 12px;padding:0}
[data-dsh-frame][data-sidebar-collapsed] [${ENTRY_ATTR}] .dsh-llamacpp-entry-label,[data-sidebar-collapsed] [${ENTRY_ATTR}] .dsh-llamacpp-entry-label{display:none}
`;

function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  const id = 'dsh-llamacpp-bridge/terminal-panel.css';
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`)) return;
  const tag = document.createElement('style');
  tag.setAttribute('data-plugin', 'dsh-llamacpp-bridge');
  tag.setAttribute('data-plugin-css', id);
  tag.textContent = PANEL_CSS;
  document.head.appendChild(tag);
}

function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector(SIDEBAR_SELECTOR);
  if (!(column instanceof HTMLElement)) return undefined;
  const logo = column.querySelector('[class*="logoRow"]');
  const parent = logo?.parentElement;
  if (parent instanceof HTMLElement && parent !== column) return parent;
  return column.firstElementChild instanceof HTMLElement ? column.firstElementChild : column;
}

function newSessionButton(root: HTMLElement): HTMLElement | undefined {
  const nested = root.querySelector('button[class*="newSession"]');
  if (nested instanceof HTMLElement) return nested;
  for (const child of Array.from(root.children)) {
    if (child.tagName === 'BUTTON') return child as HTMLElement;
  }
  return undefined;
}

function conversationColumn(): HTMLElement | undefined {
  const el = document.querySelector(CONVERSATION_SELECTOR);
  return el instanceof HTMLElement ? el : undefined;
}

function createEntry(onToggle: () => void): { entry: HTMLButtonElement; applyLabel: () => void } {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.setAttribute(ENTRY_ATTR, '');
  entry.setAttribute('data-dsh-plugin', 'dsh-llamacpp-bridge');
  entry.setAttribute('data-dsh-part', 'sidebar-entry');

  const iconSpan = document.createElement('span');
  iconSpan.className = 'dsh-llamacpp-entry-icon';
  iconSpan.innerHTML = OLLAMA_ICON_SVG;
  const svg = iconSpan.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
  }

  const labelSpan = document.createElement('span');
  labelSpan.className = 'dsh-llamacpp-entry-label';

  entry.append(iconSpan, labelSpan);
  const applyLabel = () => {
    entry.setAttribute('aria-label', TERMINAL_PANEL_LABEL);
    entry.setAttribute('title', TERMINAL_PANEL_LABEL);
    labelSpan.textContent = TERMINAL_PANEL_LABEL;
  };
  applyLabel();
  entry.addEventListener('click', onToggle);
  return { entry, applyLabel };
}

export interface MountOptions {
  directoryFor?: (sessionId: string) => ModelDirectoryLike | null;
  settings?: SettingsScopeLike | null;
  /** 会话列表快照（取当前会话 id 用）。 */
  sessionList?: { getSnapshot(): { current?: string }; subscribe(fn: () => void): () => void };
}

export interface TerminalMount {
  dispose(): void;
  isOpen(): boolean;
  toggle(): void;
}

export function mountTerminalPanel(options: MountOptions = {}): TerminalMount {
  ensureStyles();
  let open = false;
  /** 每次打开递增：让面板重新加载模型目录（避免展示过期列表）。 */
  let openNonce = 0;
  let disposed = false;
  let panelRoot: Root | undefined;
  let panelContainer: HTMLElement | undefined;

  const { entry, applyLabel } = createEntry(() => toggle());

  /* ---------- 面板（createRoot 挂会话列） ---------- */
  const ensurePanel = (): void => {
    if (disposed) return;
    if (panelContainer && panelContainer.isConnected) return;
    panelRoot?.unmount();
    panelRoot = undefined;
    panelContainer?.remove();
    panelContainer = undefined;

    const column = conversationColumn();
    if (!column) return;
    const container = document.createElement('div');
    container.setAttribute(VIEW_ATTR, '');
    container.setAttribute('data-dsh-plugin', 'dsh-llamacpp-bridge');
    column.appendChild(container);
    panelContainer = container;
    panelRoot = createRoot(container);
    panelRoot.render(
      React.createElement(LlamaCppTerminalPanel, {
        directoryFor: options.directoryFor,
        settings: options.settings,
        sessionList: options.sessionList,
        onClose: () => setOpen(false),
      } as Record<string, unknown>),
    );
  };

  const applyActive = (): void => {
    if (open) {
      openNonce += 1;
      ensurePanel();
      panelRoot?.render(
        React.createElement(LlamaCppTerminalPanel, {
          directoryFor: options.directoryFor,
          settings: options.settings,
          sessionList: options.sessionList,
          openNonce,
          onClose: () => setOpen(false),
        } as Record<string, unknown>),
      );
      document.documentElement.setAttribute(ACTIVE_ATTR, '');
      document.documentElement.removeAttribute(SIBLING_ACTIVE_ATTR);
      entry.setAttribute('data-active', 'true');
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR);
      entry.removeAttribute('data-active');
    }
  };

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    applyActive();
  }

  function toggle(): void {
    setOpen(!open);
  }

  /* ---------- 返回路径：点侧边栏会话行 / 别的面板激活 → 收起 ---------- */
  const onClickSidebarRow = (event: Event): void => {
    if (!open) return;
    const target = event.target as Element | null;
    if (target && typeof target.closest === 'function' && target.closest(SIDEBAR_ROW_SELECTOR)) {
      setOpen(false);
    }
  };
  const onOtherActivate = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    if (detail !== PANEL_NAME && open) setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (open && event.key === 'Escape') setOpen(false);
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('click', onClickSidebarRow, true);
    document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
    document.addEventListener('keydown', onKeyDown);
  }

  /* ---------- 入口行（自愈插入） ---------- */
  let sidebarEl: HTMLElement | undefined;
  let placed = false;

  const place = (container: HTMLElement): boolean => {
    const button = newSessionButton(container);
    if (!button) return false;
    if (entry.parentElement === container) return true;
    const logoRow = button.closest('[class*="logoRow"]');
    const base = logoRow instanceof HTMLElement && logoRow.parentElement === container ? logoRow : button;
    const family = Array.from(container.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches(FAMILY_SELECTOR),
    );
    const lastFamily = family.length > 0 ? family[family.length - 1] : undefined;
    const anchor = lastFamily ? lastFamily.nextElementSibling : base.nextElementSibling;
    container.insertBefore(entry, anchor);
    return true;
  };

  const tryPlace = (): void => {
    if (disposed) return;
    if (sidebarEl && !sidebarEl.isConnected) {
      rootObserver.disconnect();
      sidebarEl = undefined;
      placed = false;
    }
    if (placed && document.body.contains(entry)) return;
    sidebarEl ??= sidebarRoot();
    if (!sidebarEl) return;
    placed = place(sidebarEl);
    if (placed) {
      applyLabel();
      rootObserver.observe(sidebarEl, { childList: true, subtree: true });
    }
  };

  const waitObserver = new MutationObserver(() => {
    tryPlace();
    if (open) ensurePanel();
  });
  waitObserver.observe(document.body, { childList: true, subtree: true });

  const rootObserver = new MutationObserver(() => {
    const container = sidebarEl;
    if (!container || !container.isConnected) {
      placed = false;
      tryPlace();
      return;
    }
    if (!container.contains(entry)) placed = place(container);
  });

  tryPlace();
  applyActive();

  return {
    isOpen: () => open,
    toggle,
    dispose() {
      disposed = true;
      waitObserver.disconnect();
      rootObserver.disconnect();
      document.removeEventListener('click', onClickSidebarRow, true);
      document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
      document.removeEventListener('keydown', onKeyDown);
      document.documentElement.removeAttribute(ACTIVE_ATTR);
      panelRoot?.unmount();
      panelRoot = undefined;
      panelContainer?.remove();
      panelContainer = undefined;
      entry.remove();
    },
  };
}
