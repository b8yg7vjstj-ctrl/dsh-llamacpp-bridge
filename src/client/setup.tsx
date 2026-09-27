/**
 * llama.cpp 设置页（settings.section 座位）—— 安装后的图形化引导。
 *
 * 目标（对齐用户要求）：装完插件正常进入 DSH 主界面后，不去手改 YAML，
 * 而是由本页引导：① 选择 llama-server/llama.exe 可执行文件；② 选择模型目录。
 * 两项都提供 host 自动发现结果（base 层）作为候选项，也提供
 * 「系统目录选择器」（host.pickDirectory）与内置目录浏览器
 * （host.listDirectory）两条图形化路径。
 *
 * 写入走 ctx.settingsScope.bind(namespace) 的 set/unset：保存到用户层
 * （user document），host 侧 watch 立刻热生效（换目录重扫、换可执行文件停服，
 * 下一次请求自动起服），无需重启 DSH。
 */

import * as React from 'react';
import { DISCOVERY_NS, SETTINGS_NS } from '../shared';

/* ---------------- 依赖的公开服务形状（按存在性探测） ---------------- */

interface SettingsScopeSnapshot {
  status: 'loading' | 'ready' | 'unavailable';
  value: Record<string, unknown> | undefined;
  base: Record<string, unknown> | undefined;
  user: Record<string, unknown> | undefined;
  writable: boolean;
}

interface SettingsScopeLike {
  getSnapshot(): SettingsScopeSnapshot;
  subscribe(fn: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
  unset(field: string): Promise<void>;
}

interface DirectoryEntryLike {
  name: string;
  path: string;
  hidden: boolean;
}

interface DirectoryListingLike {
  path: string;
  home: string;
  crumbs: DirectoryEntryLike[];
  entries: DirectoryEntryLike[];
  truncated: boolean;
}

interface WorkspacesLike {
  listDirectory?(path?: string, signal?: AbortSignal): Promise<DirectoryListingLike>;
  createDirectory?(path: string, name: string): Promise<unknown>;
  pickDirectory?(): Promise<string | null>;
}

interface ExecutableCandidateLike {
  path: string;
  source: string;
}

interface ModelsDirCandidateLike {
  dir: string;
  ggufCount: number;
}

interface ProjectorBindingLike {
  file: string;
  modelId?: string;
}

export interface LlamaCppSetupProps {
  /** settings.section 的 owner props。 */
  close?: () => void;
  settings?: SettingsScopeLike | null;
  discovery?: SettingsScopeLike | null;
  workspaces?: WorkspacesLike | null;
}

/* ---------------- 小组件 ---------------- */

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  margin: '6px 0',
  flexWrap: 'wrap',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 260,
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))',
  background: 'transparent',
  color: 'inherit',
  fontSize: 12,
  fontFamily: 'inherit',
};

const buttonStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--dsw-alias-accent-weak, rgba(64,120,255,.18))',
  borderColor: 'var(--dsw-alias-accent, rgba(64,120,255,.5))',
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    ...buttonStyle,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    background: active ? 'var(--dsw-alias-accent-weak, rgba(64,120,255,.18))' : 'transparent',
  };
}

/* ---------------- 内置目录浏览器 ---------------- */

interface BrowserProps {
  workspaces: WorkspacesLike;
  title: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

function DirectoryBrowser({ workspaces, title, onPick, onClose }: BrowserProps) {
  const [listing, setListing] = React.useState<DirectoryListingLike | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(
    async (path?: string) => {
      if (!workspaces.listDirectory) return;
      setLoading(true);
      setError(null);
      try {
        const next = await workspaces.listDirectory(path);
        setListing(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [workspaces],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const entries = (listing?.entries ?? []).filter((e) => !e.hidden);

  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        marginTop: 8,
        padding: 10,
        border: '1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))',
        borderRadius: 8,
        background: 'var(--dsw-alias-surface-l2, rgba(0,0,0,.03))',
        maxHeight: 320,
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <strong style={{ fontSize: 12 }}>{title}</strong>
        <span style={{ opacity: 0.7, fontSize: 11 }}>{listing?.path ?? '…'}</span>
        <button type="button" style={{ ...buttonStyle, marginLeft: 'auto' }} onClick={onClose}>
          关闭
        </button>
      </div>

      {listing && listing.crumbs.length > 0 && (
        <div style={{ ...rowStyle, gap: 4, fontSize: 11 }}>
          {listing.crumbs.map((c) => (
            <button
              key={c.path}
              type="button"
              style={{ ...buttonStyle, padding: '2px 6px' }}
              onClick={() => void load(c.path)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#e5484d', fontSize: 12 }}>目录读取失败：{error}</div>}
      {loading && <div style={{ opacity: 0.7, fontSize: 12 }}>读取中…</div>}

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
        {entries.map((e) => (
          <button
            key={e.path}
            type="button"
            onClick={() => void load(e.path)}
            style={{
              ...buttonStyle,
              border: 'none',
              textAlign: 'left',
              padding: '3px 6px',
            }}
          >
            📁 {e.name}
          </button>
        ))}
        {!loading && entries.length === 0 && (
          <div style={{ opacity: 0.7, fontSize: 12 }}>（没有子目录）</div>
        )}
      </div>

      <div style={{ ...rowStyle, marginTop: 8 }}>
        <button
          type="button"
          style={primaryButtonStyle}
          onClick={() => listing && onPick(listing.path)}
          disabled={!listing}
        >
          就选这个目录
        </button>
        <span style={{ opacity: 0.7, fontSize: 11 }}>
          逐级进入子目录后点选；模型目录 = 存放 .gguf 的文件夹
        </span>
      </div>
    </div>
  );
}

/* ---------------- 设置页主体 ---------------- */

export function LlamaCppSettingsSection(props: LlamaCppSetupProps) {
  const { settings, discovery, workspaces } = props;

  const settingsSnapshot = React.useSyncExternalStore<SettingsScopeSnapshot | null>(
    settings ? (cb) => settings.subscribe(cb) : () => () => {},
    settings ? () => settings.getSnapshot() : () => null,
  );
  const discoverySnapshot = React.useSyncExternalStore<SettingsScopeSnapshot | null>(
    discovery ? (cb) => discovery.subscribe(cb) : () => () => {},
    discovery ? () => discovery.getSnapshot() : () => null,
  );

  const value = (settingsSnapshot?.value ?? {}) as Record<string, unknown>;
  const userLayer = (settingsSnapshot?.user ?? {}) as Record<string, unknown>;

  const [exeDraft, setExeDraft] = React.useState('');
  const [modelsDraft, setModelsDraft] = React.useState('');
  const [portDraft, setPortDraft] = React.useState('8080');
  const [strategyDraft, setStrategyDraft] = React.useState('restart');
  const [autoContextDraft, setAutoContextDraft] = React.useState(false);
  const [contextDraft, setContextDraft] = React.useState('0');
  const [gpuDraft, setGpuDraft] = React.useState('-1');
  const [mmprojDraft, setMmprojDraft] = React.useState('-mmproj.gguf');
  const [argsDraft, setArgsDraft] = React.useState('');
  const [mmprojBindings, setMmprojBindings] = React.useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [browsing, setBrowsing] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  // 从解析值（含自动检测的 base 层）初始化草稿；用户开始编辑后不覆盖。
  React.useEffect(() => {
    if (touched) return;
    setExeDraft(String(value.executable ?? ''));
    setModelsDraft(String(value.modelsDir ?? ''));
    setPortDraft(String(value.port ?? 8080));
    setStrategyDraft(String(value.strategy ?? 'restart'));
    setAutoContextDraft(Boolean(value.autoContext));
    setContextDraft(String(value.contextLength ?? 0));
    setGpuDraft(String(value.gpuLayers ?? -1));
    setMmprojDraft(String(value.mmprojSuffix ?? '-mmproj.gguf'));
    setArgsDraft(Array.isArray(value.additionalArgs) ? (value.additionalArgs as string[]).join(' ') : '');
    const ov = value.mmprojOverrides;
    setMmprojBindings(
      ov && typeof ov === 'object' && !Array.isArray(ov) ? { ...(ov as Record<string, string>) } : {},
    );
  }, [value, touched]);

  const discovered = (discoverySnapshot?.value ?? {}) as Record<string, unknown>;
  const exeCandidates = (Array.isArray(discovered.executables) ? discovered.executables : []) as ExecutableCandidateLike[];
  const dirCandidates = (Array.isArray(discovered.modelsDirs) ? discovered.modelsDirs : []) as ModelsDirCandidateLike[];
  const projectorBindings = (Array.isArray(discovered.projectors) ? discovered.projectors : []) as ProjectorBindingLike[];
  const discoveredModels = (Array.isArray(discovered.models) ? discovered.models : []) as string[];

  const configured = Boolean(value.executable) && Boolean(value.modelsDir);
  const exeFromUser = 'executable' in userLayer;
  const modelsFromUser = 'modelsDir' in userLayer;

  const save = async () => {
    if (!settings || !settingsSnapshot || settingsSnapshot.status !== 'ready') return;
    setBusy(true);
    setMessage(null);
    try {
      await settings.set('executable', exeDraft.trim());
      await settings.set('modelsDir', modelsDraft.trim());
      await settings.set('port', Number.parseInt(portDraft, 10) || 8080);
      await settings.set('strategy', strategyDraft === 'api' ? 'api' : 'restart');
      await settings.set('autoContext', autoContextDraft);
      await settings.set('contextLength', Number.parseInt(contextDraft, 10) || 0);
      await settings.set('gpuLayers', Number.parseInt(gpuDraft, 10) || 0);
      await settings.set('mmprojSuffix', mmprojDraft.trim() || '-mmproj.gguf');
      await settings.set(
        'additionalArgs',
        argsDraft
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
      setTouched(false);
      setMessage('已保存并热生效：目录立即重扫；下次发送消息时自动启动/切换 llama.cpp。');
    } catch (e) {
      setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  /** 保存「视觉投影文件 → 模型」的手动绑定。 */
  const saveMmprojBindings = async () => {
    if (!settings) return;
    setBusy(true);
    setMessage(null);
    try {
      const clean: Record<string, string> = {};
      for (const [file, modelId] of Object.entries(mmprojBindings)) {
        if (file && modelId) clean[file] = modelId;
      }
      // 以「模型 → 投影器」形式写入（与 host 侧 overrides 的键序一致）
      const byModel: Record<string, string> = {};
      for (const [file, modelId] of Object.entries(clean)) byModel[modelId] = file;
      await settings.set('mmprojOverrides', byModel);
      setTouched(false);
      setMessage('投影文件绑定已保存：下一次请求启动服务器时生效（--mmproj 参数）。');
    } catch (e) {
      setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const resetToAuto = async () => {
    if (!settings) return;
    setBusy(true);
    setMessage(null);
    try {
      await Promise.all([
        settings.unset('executable'),
        settings.unset('modelsDir'),
        settings.unset('port'),
        settings.unset('strategy'),
        settings.unset('autoContext'),
        settings.unset('contextLength'),
        settings.unset('gpuLayers'),
        settings.unset('mmprojSuffix'),
        settings.unset('additionalArgs'),
      ]);
      setTouched(false);
      setMessage('已清除保存值，回落到自动检测结果。');
    } catch (e) {
      setMessage(`清除失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const useNativePicker = async () => {
    if (!workspaces?.pickDirectory) return;
    try {
      const picked = await workspaces.pickDirectory();
      if (picked) {
        setModelsDraft(picked);
        setTouched(true);
        setMessage(`已选择模型目录：${picked}`);
      }
    } catch (e) {
      setMessage(`系统选择器不可用：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const canBrowse = Boolean(workspaces?.listDirectory);
  const canNative = Boolean(workspaces?.pickDirectory);

  return (
    <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 860 }}>
      <h3 style={{ margin: '0 0 4px' }}>llama.cpp（本机模型服务）</h3>
      <div style={{ opacity: 0.75, marginBottom: 10 }}>
        本插件在 DSH 中注册 <code>llamacpp</code> provider 路由：选择模型后发送消息时，
        DSH 会先确保本机 llama.cpp 已用该模型启动，再转发请求；切换模型会先卸载再加载。
      </div>

      {!configured && (
        <div
          style={{
            margin: '8px 0 12px',
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid rgba(240,180,41,.5)',
            background: 'rgba(240,180,41,.12)',
          }}
        >
          <strong>需要完成引导</strong>
          <div style={{ opacity: 0.85 }}>
            尚未确定{!value.executable ? ' llama-server 可执行文件' : ''}
            {!value.executable && !value.modelsDir ? ' 与' : ''}
            {!value.modelsDir ? ' 模型目录' : ''}。下面已列出自动检测结果，点一下即可填入。
          </div>
        </div>
      )}

      {/* ① 可执行文件 */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 600 }}>
          ① llama-server / llama.exe 可执行文件{' '}
          <span style={{ opacity: 0.6, fontWeight: 400 }}>
            （已保存：{exeFromUser ? '是' : '否（当前用自动检测）'}）
          </span>
        </div>
        <div style={rowStyle}>
          <input
            style={inputStyle}
            value={exeDraft}
            placeholder="例如 /Users/you/llama.cpp/build/bin/llama-server"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setExeDraft(e.target.value);
              setTouched(true);
            }}
          />
        </div>
        {exeCandidates.length > 0 ? (
          <div style={{ ...rowStyle, gap: 6 }}>
            <span style={{ opacity: 0.7, fontSize: 11 }}>自动检测：</span>
            {exeCandidates.slice(0, 6).map((c) => (
              <button
                key={c.path}
                type="button"
                title={`来源：${c.source}`}
                style={chipStyle(exeDraft === c.path)}
                onClick={() => {
                  setExeDraft(c.path);
                  setTouched(true);
                }}
              >
                {c.path}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ opacity: 0.7, fontSize: 11 }}>
            未检测到：请确认已构建 llama.cpp（例如 ~/llama.cpp/build/bin/llama-server）。
          </div>
        )}
      </div>

      {/* ② 模型目录 */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 600 }}>
          ② 模型目录（.gguf 所在文件夹）{' '}
          <span style={{ opacity: 0.6, fontWeight: 400 }}>
            （已保存：{modelsFromUser ? '是' : '否（当前用自动检测）'}）
          </span>
        </div>
        <div style={rowStyle}>
          <input
            style={inputStyle}
            value={modelsDraft}
            placeholder="例如 /Users/you/llama.cpp/models"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setModelsDraft(e.target.value);
              setTouched(true);
            }}
          />
          {canNative && (
            <button type="button" style={buttonStyle} onClick={() => void useNativePicker()}>
              系统选择器…
            </button>
          )}
          {canBrowse && (
            <button
              type="button"
              style={buttonStyle}
              onClick={() => {
                setBrowsing((v) => !v);
              }}
            >
              {browsing ? '收起浏览' : '浏览…'}
            </button>
          )}
        </div>
        {dirCandidates.length > 0 && (
          <div style={{ ...rowStyle, gap: 6 }}>
            <span style={{ opacity: 0.7, fontSize: 11 }}>自动检测：</span>
            {dirCandidates.slice(0, 6).map((c) => (
              <button
                key={c.dir}
                type="button"
                style={chipStyle(modelsDraft === c.dir)}
                onClick={() => {
                  setModelsDraft(c.dir);
                  setTouched(true);
                }}
              >
                {c.dir}（{c.ggufCount} 个模型）
              </button>
            ))}
          </div>
        )}
        {!modelsDraft && dirCandidates.length === 0 && (
          <div style={{ opacity: 0.7, fontSize: 11 }}>
            未检测到模型目录。常见位置：~/llama.cpp/models、~/models。下载 .gguf 后放入其中即可。
          </div>
        )}
        {browsing && workspaces?.listDirectory && (
          <DirectoryBrowser
            workspaces={workspaces}
            title="选择模型目录"
            onPick={(path) => {
              setModelsDraft(path);
              setTouched(true);
              setBrowsing(false);
              setMessage(`已选择模型目录：${path}`);
            }}
            onClose={() => setBrowsing(false)}
          />
        )}
      </div>

      {/* ③ 视觉投影文件（mmproj）绑定 */}
      {projectorBindings.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 600 }}>
            ③ 视觉投影文件（mmproj）
            <span style={{ opacity: 0.6, fontWeight: 400 }}>
              {' '}—— 自动配对失败时在此手动绑定；已配对的会随模型一起用 --mmproj 加载
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            {projectorBindings.map((p) => {
              const auto = p.modelId ?? '';
              const manual = mmprojBindings[p.file] ?? '';
              const effective = manual || auto;
              return (
                <div key={p.file} style={rowStyle}>
                  <span style={{ minWidth: 230, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                    {p.file}
                  </span>
                  <input
                    list="dsh-llamacpp-model-ids"
                    style={inputStyle}
                    placeholder={auto ? `已自动配对：${auto}` : '未配对 —— 填模型 id 以绑定'}
                    value={manual}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setMmprojBindings((prev) => ({ ...prev, [p.file]: e.target.value }));
                      setTouched(true);
                    }}
                  />
                  <span style={{ opacity: 0.65, fontSize: 11, minWidth: 120 }}>
                    {effective ? `→ ${effective}` : '（未绑定）'}
                  </span>
                </div>
              );
            })}
            <datalist id="dsh-llamacpp-model-ids">
              {discoveredModels.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
            <div style={rowStyle}>
              <button type="button" style={buttonStyle} onClick={() => void saveMmprojBindings()} disabled={busy}>
                保存投影绑定
              </button>
              <span style={{ opacity: 0.65, fontSize: 11 }}>
                留空 = 使用自动配对结果；填写模型 id = 强制把该投影文件用于该模型
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 保存 / 重置 */}
      <div style={{ ...rowStyle, marginTop: 14 }}>
        <button type="button" style={primaryButtonStyle} onClick={() => void save()} disabled={busy}>
          {busy ? '保存中…' : '保存并应用'}
        </button>
        <button type="button" style={buttonStyle} onClick={() => void resetToAuto()} disabled={busy}>
          恢复自动检测
        </button>
        <button type="button" style={buttonStyle} onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? '隐藏高级选项' : '高级选项'}
        </button>
        {settingsSnapshot?.status === 'ready' && !settingsSnapshot.writable && (
          <span style={{ opacity: 0.7, fontSize: 11 }}>当前连接不可写（仅本地 Host 可改）</span>
        )}
      </div>

      {message && (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>{message}</div>
      )}

      {/* 高级选项 */}
      {showAdvanced && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(128,128,128,.25)' }}>
          <div style={rowStyle}>
            <label style={{ width: 110 }}>端口</label>
            <input
              style={{ ...inputStyle, minWidth: 100, flex: 'none' }}
              value={portDraft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setPortDraft(e.target.value);
                setTouched(true);
              }}
            />
            <label style={{ marginLeft: 12 }}>切换策略</label>
            <select
              value={strategyDraft}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setStrategyDraft(e.target.value);
                setTouched(true);
              }}
              style={{ ...inputStyle, minWidth: 140, flex: 'none' }}
            >
              <option value="restart">restart（停旧起新，兼容性最好）</option>
              <option value="api">api（router 免重启切换）</option>
            </select>
          </div>
          <div style={rowStyle}>
            <label style={{ width: 110 }}>GPU 层数</label>
            <input
              style={{ ...inputStyle, minWidth: 100, flex: 'none' }}
              value={gpuDraft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setGpuDraft(e.target.value);
                setTouched(true);
              }}
            />
            <label style={{ marginLeft: 12 }}>
              <input
                type="checkbox"
                checked={autoContextDraft}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setAutoContextDraft(e.target.checked);
                  setTouched(true);
                }}
              />{' '}
              按内存自动估算上下文
            </label>
            <label style={{ marginLeft: 12 }}>上下文 token</label>
            <input
              style={{ ...inputStyle, minWidth: 100, flex: 'none' }}
              value={contextDraft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setContextDraft(e.target.value);
                setTouched(true);
              }}
            />
          </div>
          <div style={rowStyle}>
            <label style={{ width: 110 }}>mmproj 后缀</label>
            <input
              style={inputStyle}
              value={mmprojDraft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setMmprojDraft(e.target.value);
                setTouched(true);
              }}
            />
          </div>
          <div style={rowStyle}>
            <label style={{ width: 110 }}>附加参数</label>
            <input
              style={inputStyle}
              value={argsDraft}
              placeholder="例如 --verbose --flash-attn"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setArgsDraft(e.target.value);
                setTouched(true);
              }}
            />
          </div>
          <div style={{ opacity: 0.65, fontSize: 11 }}>
            提示：contextLength=0 且勾选自动估算时由 host 按内存启发式选择；直接填具体 token 数
            则优先使用该值。端口/可执行文件变更会停掉当前服务器，下次请求按新配置启动。
          </div>
        </div>
      )}
    </div>
  );
}

/** 供侧边栏面板复用的命名空间常量（避免面板重复硬编码）。 */
export const SETUP_NAMESPACES = { settings: SETTINGS_NS, discovery: DISCOVERY_NS };
