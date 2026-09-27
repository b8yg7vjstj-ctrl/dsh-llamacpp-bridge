var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/setup.tsx
var React = __toESM(require("react"), 1);

// src/shared.ts
var SETTINGS_NS = "llamacpp-bridge";
var DISCOVERY_NS = "llamacpp-bridge-discovery";
var DEFAULT_HOST = "127.0.0.1";
var DEFAULT_PORT = 8080;
var PROBE_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}/v1/models`;
var TERMINAL_ROUTE_PREFIX = "/api/llamacpp-bridge";
var TERMINAL_PANEL_LABEL = "llama.cpp \u7EC8\u7AEF\u8F93\u51FA\u76D1\u63A7";
var MODEL_NAME_MAX = 30;
function truncateModelName(name, max = MODEL_NAME_MAX) {
  if (name.length <= max) return name;
  return `${name.slice(0, max)}...`;
}

// src/client/setup.tsx
var rowStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  margin: "6px 0",
  flexWrap: "wrap"
};
var inputStyle = {
  flex: 1,
  minWidth: 260,
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))",
  background: "transparent",
  color: "inherit",
  fontSize: 12,
  fontFamily: "inherit"
};
var buttonStyle = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "inherit",
  whiteSpace: "nowrap"
};
var primaryButtonStyle = {
  ...buttonStyle,
  background: "var(--dsw-alias-accent-weak, rgba(64,120,255,.18))",
  borderColor: "var(--dsw-alias-accent, rgba(64,120,255,.5))"
};
function chipStyle(active) {
  return {
    ...buttonStyle,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    background: active ? "var(--dsw-alias-accent-weak, rgba(64,120,255,.18))" : "transparent"
  };
}
function DirectoryBrowser({ workspaces, title, onPick, onClose }) {
  const [listing, setListing] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const load = React.useCallback(
    async (path) => {
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
    [workspaces]
  );
  React.useEffect(() => {
    void load();
  }, [load]);
  const entries = (listing?.entries ?? []).filter((e) => !e.hidden);
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      role: "dialog",
      "aria-label": title,
      style: {
        marginTop: 8,
        padding: 10,
        border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))",
        borderRadius: 8,
        background: "var(--dsw-alias-surface-l2, rgba(0,0,0,.03))",
        maxHeight: 320,
        overflow: "auto"
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("strong", { style: { fontSize: 12 } }, title), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.7, fontSize: 11 } }, listing?.path ?? "\u2026"), /* @__PURE__ */ React.createElement("button", { type: "button", style: { ...buttonStyle, marginLeft: "auto" }, onClick: onClose }, "\u5173\u95ED")),
    listing && listing.crumbs.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { ...rowStyle, gap: 4, fontSize: 11 } }, listing.crumbs.map((c) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: c.path,
        type: "button",
        style: { ...buttonStyle, padding: "2px 6px" },
        onClick: () => void load(c.path)
      },
      c.name
    ))),
    error && /* @__PURE__ */ React.createElement("div", { style: { color: "#e5484d", fontSize: 12 } }, "\u76EE\u5F55\u8BFB\u53D6\u5931\u8D25\uFF1A", error),
    loading && /* @__PURE__ */ React.createElement("div", { style: { opacity: 0.7, fontSize: 12 } }, "\u8BFB\u53D6\u4E2D\u2026"),
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", marginTop: 4 } }, entries.map((e) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: e.path,
        type: "button",
        onClick: () => void load(e.path),
        style: {
          ...buttonStyle,
          border: "none",
          textAlign: "left",
          padding: "3px 6px"
        }
      },
      "\u{1F4C1} ",
      e.name
    )), !loading && entries.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { opacity: 0.7, fontSize: 12 } }, "\uFF08\u6CA1\u6709\u5B50\u76EE\u5F55\uFF09")),
    /* @__PURE__ */ React.createElement("div", { style: { ...rowStyle, marginTop: 8 } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        style: primaryButtonStyle,
        onClick: () => listing && onPick(listing.path),
        disabled: !listing
      },
      "\u5C31\u9009\u8FD9\u4E2A\u76EE\u5F55"
    ), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.7, fontSize: 11 } }, "\u9010\u7EA7\u8FDB\u5165\u5B50\u76EE\u5F55\u540E\u70B9\u9009\uFF1B\u6A21\u578B\u76EE\u5F55 = \u5B58\u653E .gguf \u7684\u6587\u4EF6\u5939"))
  );
}
function LlamaCppSettingsSection(props) {
  const { settings, discovery, workspaces } = props;
  const settingsSnapshot = React.useSyncExternalStore(
    settings ? (cb) => settings.subscribe(cb) : () => () => {
    },
    settings ? () => settings.getSnapshot() : () => null
  );
  const discoverySnapshot = React.useSyncExternalStore(
    discovery ? (cb) => discovery.subscribe(cb) : () => () => {
    },
    discovery ? () => discovery.getSnapshot() : () => null
  );
  const value = settingsSnapshot?.value ?? {};
  const userLayer = settingsSnapshot?.user ?? {};
  const [exeDraft, setExeDraft] = React.useState("");
  const [modelsDraft, setModelsDraft] = React.useState("");
  const [portDraft, setPortDraft] = React.useState("8080");
  const [strategyDraft, setStrategyDraft] = React.useState("restart");
  const [autoContextDraft, setAutoContextDraft] = React.useState(false);
  const [contextDraft, setContextDraft] = React.useState("0");
  const [gpuDraft, setGpuDraft] = React.useState("-1");
  const [mmprojDraft, setMmprojDraft] = React.useState("-mmproj.gguf");
  const [argsDraft, setArgsDraft] = React.useState("");
  const [mmprojBindings, setMmprojBindings] = React.useState({});
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState(null);
  const [browsing, setBrowsing] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (touched) return;
    setExeDraft(String(value.executable ?? ""));
    setModelsDraft(String(value.modelsDir ?? ""));
    setPortDraft(String(value.port ?? 8080));
    setStrategyDraft(String(value.strategy ?? "restart"));
    setAutoContextDraft(Boolean(value.autoContext));
    setContextDraft(String(value.contextLength ?? 0));
    setGpuDraft(String(value.gpuLayers ?? -1));
    setMmprojDraft(String(value.mmprojSuffix ?? "-mmproj.gguf"));
    setArgsDraft(Array.isArray(value.additionalArgs) ? value.additionalArgs.join(" ") : "");
    const ov = value.mmprojOverrides;
    setMmprojBindings(
      ov && typeof ov === "object" && !Array.isArray(ov) ? { ...ov } : {}
    );
  }, [value, touched]);
  const discovered = discoverySnapshot?.value ?? {};
  const exeCandidates = Array.isArray(discovered.executables) ? discovered.executables : [];
  const dirCandidates = Array.isArray(discovered.modelsDirs) ? discovered.modelsDirs : [];
  const projectorBindings = Array.isArray(discovered.projectors) ? discovered.projectors : [];
  const discoveredModels = Array.isArray(discovered.models) ? discovered.models : [];
  const configured = Boolean(value.executable) && Boolean(value.modelsDir);
  const exeFromUser = "executable" in userLayer;
  const modelsFromUser = "modelsDir" in userLayer;
  const save = async () => {
    if (!settings || !settingsSnapshot || settingsSnapshot.status !== "ready") return;
    setBusy(true);
    setMessage(null);
    try {
      await settings.set("executable", exeDraft.trim());
      await settings.set("modelsDir", modelsDraft.trim());
      await settings.set("port", Number.parseInt(portDraft, 10) || 8080);
      await settings.set("strategy", strategyDraft === "api" ? "api" : "restart");
      await settings.set("autoContext", autoContextDraft);
      await settings.set("contextLength", Number.parseInt(contextDraft, 10) || 0);
      await settings.set("gpuLayers", Number.parseInt(gpuDraft, 10) || 0);
      await settings.set("mmprojSuffix", mmprojDraft.trim() || "-mmproj.gguf");
      await settings.set(
        "additionalArgs",
        argsDraft.split(/\s+/).map((s) => s.trim()).filter(Boolean)
      );
      setTouched(false);
      setMessage("\u5DF2\u4FDD\u5B58\u5E76\u70ED\u751F\u6548\uFF1A\u76EE\u5F55\u7ACB\u5373\u91CD\u626B\uFF1B\u4E0B\u6B21\u53D1\u9001\u6D88\u606F\u65F6\u81EA\u52A8\u542F\u52A8/\u5207\u6362 llama.cpp\u3002");
    } catch (e) {
      setMessage(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const saveMmprojBindings = async () => {
    if (!settings) return;
    setBusy(true);
    setMessage(null);
    try {
      const clean = {};
      for (const [file, modelId] of Object.entries(mmprojBindings)) {
        if (file && modelId) clean[file] = modelId;
      }
      const byModel = {};
      for (const [file, modelId] of Object.entries(clean)) byModel[modelId] = file;
      await settings.set("mmprojOverrides", byModel);
      setTouched(false);
      setMessage("\u6295\u5F71\u6587\u4EF6\u7ED1\u5B9A\u5DF2\u4FDD\u5B58\uFF1A\u4E0B\u4E00\u6B21\u8BF7\u6C42\u542F\u52A8\u670D\u52A1\u5668\u65F6\u751F\u6548\uFF08--mmproj \u53C2\u6570\uFF09\u3002");
    } catch (e) {
      setMessage(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
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
        settings.unset("executable"),
        settings.unset("modelsDir"),
        settings.unset("port"),
        settings.unset("strategy"),
        settings.unset("autoContext"),
        settings.unset("contextLength"),
        settings.unset("gpuLayers"),
        settings.unset("mmprojSuffix"),
        settings.unset("additionalArgs")
      ]);
      setTouched(false);
      setMessage("\u5DF2\u6E05\u9664\u4FDD\u5B58\u503C\uFF0C\u56DE\u843D\u5230\u81EA\u52A8\u68C0\u6D4B\u7ED3\u679C\u3002");
    } catch (e) {
      setMessage(`\u6E05\u9664\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
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
        setMessage(`\u5DF2\u9009\u62E9\u6A21\u578B\u76EE\u5F55\uFF1A${picked}`);
      }
    } catch (e) {
      setMessage(`\u7CFB\u7EDF\u9009\u62E9\u5668\u4E0D\u53EF\u7528\uFF1A${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const canBrowse = Boolean(workspaces?.listDirectory);
  const canNative = Boolean(workspaces?.pickDirectory);
  return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, lineHeight: 1.6, maxWidth: 860 } }, /* @__PURE__ */ React.createElement("h3", { style: { margin: "0 0 4px" } }, "llama.cpp\uFF08\u672C\u673A\u6A21\u578B\u670D\u52A1\uFF09"), /* @__PURE__ */ React.createElement("div", { style: { opacity: 0.75, marginBottom: 10 } }, "\u672C\u63D2\u4EF6\u5728 DSH \u4E2D\u6CE8\u518C ", /* @__PURE__ */ React.createElement("code", null, "llamacpp"), " provider \u8DEF\u7531\uFF1A\u9009\u62E9\u6A21\u578B\u540E\u53D1\u9001\u6D88\u606F\u65F6\uFF0C DSH \u4F1A\u5148\u786E\u4FDD\u672C\u673A llama.cpp \u5DF2\u7528\u8BE5\u6A21\u578B\u542F\u52A8\uFF0C\u518D\u8F6C\u53D1\u8BF7\u6C42\uFF1B\u5207\u6362\u6A21\u578B\u4F1A\u5148\u5378\u8F7D\u518D\u52A0\u8F7D\u3002"), !configured && /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        margin: "8px 0 12px",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid rgba(240,180,41,.5)",
        background: "rgba(240,180,41,.12)"
      }
    },
    /* @__PURE__ */ React.createElement("strong", null, "\u9700\u8981\u5B8C\u6210\u5F15\u5BFC"),
    /* @__PURE__ */ React.createElement("div", { style: { opacity: 0.85 } }, "\u5C1A\u672A\u786E\u5B9A", !value.executable ? " llama-server \u53EF\u6267\u884C\u6587\u4EF6" : "", !value.executable && !value.modelsDir ? " \u4E0E" : "", !value.modelsDir ? " \u6A21\u578B\u76EE\u5F55" : "", "\u3002\u4E0B\u9762\u5DF2\u5217\u51FA\u81EA\u52A8\u68C0\u6D4B\u7ED3\u679C\uFF0C\u70B9\u4E00\u4E0B\u5373\u53EF\u586B\u5165\u3002")
  ), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600 } }, "\u2460 llama-server / llama.exe \u53EF\u6267\u884C\u6587\u4EF6", " ", /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.6, fontWeight: 400 } }, "\uFF08\u5DF2\u4FDD\u5B58\uFF1A", exeFromUser ? "\u662F" : "\u5426\uFF08\u5F53\u524D\u7528\u81EA\u52A8\u68C0\u6D4B\uFF09", "\uFF09")), /* @__PURE__ */ React.createElement("div", { style: rowStyle }, /* @__PURE__ */ React.createElement(
    "input",
    {
      style: inputStyle,
      value: exeDraft,
      placeholder: "\u4F8B\u5982 /Users/you/llama.cpp/build/bin/llama-server",
      onChange: (e) => {
        setExeDraft(e.target.value);
        setTouched(true);
      }
    }
  )), exeCandidates.length > 0 ? /* @__PURE__ */ React.createElement("div", { style: { ...rowStyle, gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.7, fontSize: 11 } }, "\u81EA\u52A8\u68C0\u6D4B\uFF1A"), exeCandidates.slice(0, 6).map((c) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: c.path,
      type: "button",
      title: `\u6765\u6E90\uFF1A${c.source}`,
      style: chipStyle(exeDraft === c.path),
      onClick: () => {
        setExeDraft(c.path);
        setTouched(true);
      }
    },
    c.path
  ))) : /* @__PURE__ */ React.createElement("div", { style: { opacity: 0.7, fontSize: 11 } }, "\u672A\u68C0\u6D4B\u5230\uFF1A\u8BF7\u786E\u8BA4\u5DF2\u6784\u5EFA llama.cpp\uFF08\u4F8B\u5982 ~/llama.cpp/build/bin/llama-server\uFF09\u3002")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600 } }, "\u2461 \u6A21\u578B\u76EE\u5F55\uFF08.gguf \u6240\u5728\u6587\u4EF6\u5939\uFF09", " ", /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.6, fontWeight: 400 } }, "\uFF08\u5DF2\u4FDD\u5B58\uFF1A", modelsFromUser ? "\u662F" : "\u5426\uFF08\u5F53\u524D\u7528\u81EA\u52A8\u68C0\u6D4B\uFF09", "\uFF09")), /* @__PURE__ */ React.createElement("div", { style: rowStyle }, /* @__PURE__ */ React.createElement(
    "input",
    {
      style: inputStyle,
      value: modelsDraft,
      placeholder: "\u4F8B\u5982 /Users/you/llama.cpp/models",
      onChange: (e) => {
        setModelsDraft(e.target.value);
        setTouched(true);
      }
    }
  ), canNative && /* @__PURE__ */ React.createElement("button", { type: "button", style: buttonStyle, onClick: () => void useNativePicker() }, "\u7CFB\u7EDF\u9009\u62E9\u5668\u2026"), canBrowse && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      style: buttonStyle,
      onClick: () => {
        setBrowsing((v) => !v);
      }
    },
    browsing ? "\u6536\u8D77\u6D4F\u89C8" : "\u6D4F\u89C8\u2026"
  )), dirCandidates.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { ...rowStyle, gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.7, fontSize: 11 } }, "\u81EA\u52A8\u68C0\u6D4B\uFF1A"), dirCandidates.slice(0, 6).map((c) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: c.dir,
      type: "button",
      style: chipStyle(modelsDraft === c.dir),
      onClick: () => {
        setModelsDraft(c.dir);
        setTouched(true);
      }
    },
    c.dir,
    "\uFF08",
    c.ggufCount,
    " \u4E2A\u6A21\u578B\uFF09"
  ))), !modelsDraft && dirCandidates.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { opacity: 0.7, fontSize: 11 } }, "\u672A\u68C0\u6D4B\u5230\u6A21\u578B\u76EE\u5F55\u3002\u5E38\u89C1\u4F4D\u7F6E\uFF1A~/llama.cpp/models\u3001~/models\u3002\u4E0B\u8F7D .gguf \u540E\u653E\u5165\u5176\u4E2D\u5373\u53EF\u3002"), browsing && workspaces?.listDirectory && /* @__PURE__ */ React.createElement(
    DirectoryBrowser,
    {
      workspaces,
      title: "\u9009\u62E9\u6A21\u578B\u76EE\u5F55",
      onPick: (path) => {
        setModelsDraft(path);
        setTouched(true);
        setBrowsing(false);
        setMessage(`\u5DF2\u9009\u62E9\u6A21\u578B\u76EE\u5F55\uFF1A${path}`);
      },
      onClose: () => setBrowsing(false)
    }
  )), projectorBindings.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600 } }, "\u2462 \u89C6\u89C9\u6295\u5F71\u6587\u4EF6\uFF08mmproj\uFF09", /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.6, fontWeight: 400 } }, " ", "\u2014\u2014 \u81EA\u52A8\u914D\u5BF9\u5931\u8D25\u65F6\u5728\u6B64\u624B\u52A8\u7ED1\u5B9A\uFF1B\u5DF2\u914D\u5BF9\u7684\u4F1A\u968F\u6A21\u578B\u4E00\u8D77\u7528 --mmproj \u52A0\u8F7D")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4 } }, projectorBindings.map((p) => {
    const auto = p.modelId ?? "";
    const manual = mmprojBindings[p.file] ?? "";
    const effective = manual || auto;
    return /* @__PURE__ */ React.createElement("div", { key: p.file, style: rowStyle }, /* @__PURE__ */ React.createElement("span", { style: { minWidth: 230, fontFamily: "ui-monospace, monospace", fontSize: 12 } }, p.file), /* @__PURE__ */ React.createElement(
      "input",
      {
        list: "dsh-llamacpp-model-ids",
        style: inputStyle,
        placeholder: auto ? `\u5DF2\u81EA\u52A8\u914D\u5BF9\uFF1A${auto}` : "\u672A\u914D\u5BF9 \u2014\u2014 \u586B\u6A21\u578B id \u4EE5\u7ED1\u5B9A",
        value: manual,
        onChange: (e) => {
          setMmprojBindings((prev) => ({ ...prev, [p.file]: e.target.value }));
          setTouched(true);
        }
      }
    ), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.65, fontSize: 11, minWidth: 120 } }, effective ? `\u2192 ${effective}` : "\uFF08\u672A\u7ED1\u5B9A\uFF09"));
  }), /* @__PURE__ */ React.createElement("datalist", { id: "dsh-llamacpp-model-ids" }, discoveredModels.map((id) => /* @__PURE__ */ React.createElement("option", { key: id, value: id }))), /* @__PURE__ */ React.createElement("div", { style: rowStyle }, /* @__PURE__ */ React.createElement("button", { type: "button", style: buttonStyle, onClick: () => void saveMmprojBindings(), disabled: busy }, "\u4FDD\u5B58\u6295\u5F71\u7ED1\u5B9A"), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.65, fontSize: 11 } }, "\u7559\u7A7A = \u4F7F\u7528\u81EA\u52A8\u914D\u5BF9\u7ED3\u679C\uFF1B\u586B\u5199\u6A21\u578B id = \u5F3A\u5236\u628A\u8BE5\u6295\u5F71\u6587\u4EF6\u7528\u4E8E\u8BE5\u6A21\u578B")))), /* @__PURE__ */ React.createElement("div", { style: { ...rowStyle, marginTop: 14 } }, /* @__PURE__ */ React.createElement("button", { type: "button", style: primaryButtonStyle, onClick: () => void save(), disabled: busy }, busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u5E76\u5E94\u7528"), /* @__PURE__ */ React.createElement("button", { type: "button", style: buttonStyle, onClick: () => void resetToAuto(), disabled: busy }, "\u6062\u590D\u81EA\u52A8\u68C0\u6D4B"), /* @__PURE__ */ React.createElement("button", { type: "button", style: buttonStyle, onClick: () => setShowAdvanced((v) => !v) }, showAdvanced ? "\u9690\u85CF\u9AD8\u7EA7\u9009\u9879" : "\u9AD8\u7EA7\u9009\u9879"), settingsSnapshot?.status === "ready" && !settingsSnapshot.writable && /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.7, fontSize: 11 } }, "\u5F53\u524D\u8FDE\u63A5\u4E0D\u53EF\u5199\uFF08\u4EC5\u672C\u5730 Host \u53EF\u6539\uFF09")), message && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, fontSize: 12, opacity: 0.9 } }, message), showAdvanced && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(128,128,128,.25)" } }, /* @__PURE__ */ React.createElement("div", { style: rowStyle }, /* @__PURE__ */ React.createElement("label", { style: { width: 110 } }, "\u7AEF\u53E3"), /* @__PURE__ */ React.createElement(
    "input",
    {
      style: { ...inputStyle, minWidth: 100, flex: "none" },
      value: portDraft,
      onChange: (e) => {
        setPortDraft(e.target.value);
        setTouched(true);
      }
    }
  ), /* @__PURE__ */ React.createElement("label", { style: { marginLeft: 12 } }, "\u5207\u6362\u7B56\u7565"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: strategyDraft,
      onChange: (e) => {
        setStrategyDraft(e.target.value);
        setTouched(true);
      },
      style: { ...inputStyle, minWidth: 140, flex: "none" }
    },
    /* @__PURE__ */ React.createElement("option", { value: "restart" }, "restart\uFF08\u505C\u65E7\u8D77\u65B0\uFF0C\u517C\u5BB9\u6027\u6700\u597D\uFF09"),
    /* @__PURE__ */ React.createElement("option", { value: "api" }, "api\uFF08router \u514D\u91CD\u542F\u5207\u6362\uFF09")
  )), /* @__PURE__ */ React.createElement("div", { style: rowStyle }, /* @__PURE__ */ React.createElement("label", { style: { width: 110 } }, "GPU \u5C42\u6570"), /* @__PURE__ */ React.createElement(
    "input",
    {
      style: { ...inputStyle, minWidth: 100, flex: "none" },
      value: gpuDraft,
      onChange: (e) => {
        setGpuDraft(e.target.value);
        setTouched(true);
      }
    }
  ), /* @__PURE__ */ React.createElement("label", { style: { marginLeft: 12 } }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "checkbox",
      checked: autoContextDraft,
      onChange: (e) => {
        setAutoContextDraft(e.target.checked);
        setTouched(true);
      }
    }
  ), " ", "\u6309\u5185\u5B58\u81EA\u52A8\u4F30\u7B97\u4E0A\u4E0B\u6587"), /* @__PURE__ */ React.createElement("label", { style: { marginLeft: 12 } }, "\u4E0A\u4E0B\u6587 token"), /* @__PURE__ */ React.createElement(
    "input",
    {
      style: { ...inputStyle, minWidth: 100, flex: "none" },
      value: contextDraft,
      onChange: (e) => {
        setContextDraft(e.target.value);
        setTouched(true);
      }
    }
  )), /* @__PURE__ */ React.createElement("div", { style: rowStyle }, /* @__PURE__ */ React.createElement("label", { style: { width: 110 } }, "mmproj \u540E\u7F00"), /* @__PURE__ */ React.createElement(
    "input",
    {
      style: inputStyle,
      value: mmprojDraft,
      onChange: (e) => {
        setMmprojDraft(e.target.value);
        setTouched(true);
      }
    }
  )), /* @__PURE__ */ React.createElement("div", { style: rowStyle }, /* @__PURE__ */ React.createElement("label", { style: { width: 110 } }, "\u9644\u52A0\u53C2\u6570"), /* @__PURE__ */ React.createElement(
    "input",
    {
      style: inputStyle,
      value: argsDraft,
      placeholder: "\u4F8B\u5982 --verbose --flash-attn",
      onChange: (e) => {
        setArgsDraft(e.target.value);
        setTouched(true);
      }
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { opacity: 0.65, fontSize: 11 } }, "\u63D0\u793A\uFF1AcontextLength=0 \u4E14\u52FE\u9009\u81EA\u52A8\u4F30\u7B97\u65F6\u7531 host \u6309\u5185\u5B58\u542F\u53D1\u5F0F\u9009\u62E9\uFF1B\u76F4\u63A5\u586B\u5177\u4F53 token \u6570 \u5219\u4F18\u5148\u4F7F\u7528\u8BE5\u503C\u3002\u7AEF\u53E3/\u53EF\u6267\u884C\u6587\u4EF6\u53D8\u66F4\u4F1A\u505C\u6389\u5F53\u524D\u670D\u52A1\u5668\uFF0C\u4E0B\u6B21\u8BF7\u6C42\u6309\u65B0\u914D\u7F6E\u542F\u52A8\u3002")));
}

// src/client/terminal-mount.ts
var React3 = __toESM(require("react"), 1);
var import_client = require("react-dom/client");

// src/client/ollama-icon.ts
var OLLAMA_ICON_SVG = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.6" y="3" width="12.8" height="9" rx="1.6"/><path d="M4.2 6.2l1.8 1.7-1.8 1.7"/><path d="M7.6 9.6h3.6"/></svg>';

// src/client/terminal-panel.tsx
var React2 = __toESM(require("react"), 1);
var PHASE_TEXT = {
  idle: "\u672A\u8FD0\u884C",
  starting: "\u542F\u52A8\u4E2D",
  running: "\u8FD0\u884C\u4E2D",
  stopping: "\u505C\u6B62\u4E2D",
  error: "\u9519\u8BEF"
};
var PHASE_COLOR = {
  idle: "#9e9e9e",
  starting: "#f0b429",
  running: "#4caf50",
  stopping: "#f0b429",
  error: "#e5484d"
};
var STREAM_COLOR = {
  stdout: "inherit",
  stderr: "#e5a04d",
  system: "#7aa2f7"
};
var mono = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
  lineHeight: 1.5
};
async function fetchSnapshot() {
  try {
    const res = await fetch(`${TERMINAL_ROUTE_PREFIX}/state`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5e3)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
function ModelSwitcher(props) {
  const { directoryFor, settings, sessionList } = props;
  const currentFromList = React2.useSyncExternalStore(
    sessionList ? (cb) => sessionList.subscribe(cb) : () => () => {
    },
    sessionList ? () => sessionList.getSnapshot().current : () => void 0
  );
  const sessionId = props.sessionId ?? currentFromList;
  const [dir, setDir] = React2.useState(null);
  React2.useEffect(() => {
    if (!directoryFor || !sessionId) {
      setDir(null);
      return;
    }
    let cancelled = false;
    let timer;
    const tryResolve = () => {
      const next = directoryFor(sessionId);
      if (!next) {
        timer = window.setTimeout(tryResolve, 500);
        return;
      }
      if (cancelled) return;
      setDir(next);
      next.load().catch(() => {
      });
    };
    tryResolve();
    return () => {
      cancelled = true;
      if (timer !== void 0) window.clearTimeout(timer);
    };
  }, [directoryFor, sessionId, props.openNonce]);
  const state = React2.useSyncExternalStore(
    dir ? (cb) => dir.store.subscribe(cb) : () => () => {
    },
    dir ? () => dir.store.getSnapshot() : () => null
  );
  const settingsSnapshot = React2.useSyncExternalStore(
    settings ? (cb) => settings.subscribe(cb) : () => () => {
    },
    settings ? () => settings.getSnapshot() : () => null
  );
  const group = state?.groups.find((g) => g.id === "llamacpp") ?? null;
  const current = state?.current?.provider === "llamacpp" ? state.current.model : null;
  const modelsDir = settingsSnapshot?.value?.["modelsDir"];
  if (!group || group.models.length === 0) {
    return /* @__PURE__ */ React2.createElement("div", { style: { margin: "0 14px 8px", fontSize: 12, opacity: 0.75 } }, state?.status === "loading" || !state ? "\u6A21\u578B\u76EE\u5F55\u52A0\u8F7D\u4E2D\u2026" : "\u672A\u53D1\u73B0 llamacpp \u6A21\u578B\uFF1A\u8BF7\u5728 \u8BBE\u7F6E \u2192 llama.cpp \u4E2D\u9009\u62E9\u6A21\u578B\u76EE\u5F55\u3002");
  }
  return /* @__PURE__ */ React2.createElement("div", { style: { margin: "0 14px 8px", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 12, opacity: 0.7 } }, "\u6A21\u578B\uFF1A"), group.models.map((m) => {
    const active = current === m.id;
    const vision = (m.description ?? "").toLowerCase().includes("mmproj");
    return /* @__PURE__ */ React2.createElement(
      "button",
      {
        key: m.id,
        type: "button",
        title: `${m.id}${m.description ? ` \xB7 ${m.description}` : ""}`,
        disabled: state?.status === "selecting",
        onClick: () => {
          void dir?.select({ provider: "llamacpp", model: m.id }).catch(() => {
          });
        },
        style: {
          padding: "3px 8px",
          borderRadius: 6,
          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
          background: active ? "rgba(64,120,255,.18)" : "transparent",
          color: "inherit",
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "inherit"
        }
      },
      vision ? "\u{1F441} " : "",
      truncateModelName(m.name),
      active ? " \u2713" : ""
    );
  }), /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      title: "\u91CD\u65B0\u626B\u63CF\u6A21\u578B\u76EE\u5F55",
      onClick: () => {
        void dir?.load().catch(() => {
        });
      },
      style: {
        padding: "3px 8px",
        borderRadius: 6,
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "inherit"
      }
    },
    "\u5237\u65B0"
  ), !modelsDir && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, opacity: 0.7 } }, "\uFF08\u672A\u914D\u7F6E\u6A21\u578B\u76EE\u5F55\uFF1A\u8BBE\u7F6E \u2192 llama.cpp\uFF09"));
}
function LlamaCppTerminalPanel(props) {
  const [snapshot, setSnapshot] = React2.useState(null);
  const [log, setLog] = React2.useState([]);
  const [connected, setConnected] = React2.useState(false);
  const [error, setError] = React2.useState(null);
  const [follow, setFollow] = React2.useState(true);
  const [filter, setFilter] = React2.useState("");
  const [stopping, setStopping] = React2.useState(false);
  const [stopMessage, setStopMessage] = React2.useState(null);
  const viewRef = React2.useRef(null);
  React2.useEffect(() => {
    let closed = false;
    let es = null;
    let retry;
    let lastSeq = 0;
    const mergeLog = (entries) => {
      if (entries.length === 0) return;
      setLog((prev) => {
        const seen = new Set(prev.map((e) => e.seq));
        const merged = [...prev, ...entries.filter((e) => !seen.has(e.seq))];
        merged.sort((a, b) => a.seq - b.seq);
        return merged.slice(-2e3);
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
      es.addEventListener("open", () => {
        setConnected(true);
        setError(null);
      });
      es.addEventListener("snapshot", (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setSnapshot(data);
          setLog(data.log ?? []);
          lastSeq = data.lastSeq ?? 0;
        } catch {
        }
      });
      es.addEventListener("log", (ev) => {
        try {
          mergeLog([JSON.parse(ev.data)]);
        } catch {
        }
      });
      es.addEventListener("status", (ev) => {
        try {
          const st = JSON.parse(ev.data);
          setSnapshot((prev) => prev ? { ...prev, status: st } : prev);
        } catch {
        }
      });
      es.addEventListener("error", () => {
        setConnected(false);
        es?.close();
        es = null;
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
      if (retry !== void 0) window.clearTimeout(retry);
      es?.close();
    };
  }, []);
  React2.useEffect(() => {
    if (!follow) return;
    const el = viewRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, follow]);
  const gracefulStop = async () => {
    setStopping(true);
    setStopMessage("\u6B63\u5728\u53D1\u9001 Ctrl+C \u2026");
    try {
      const res = await fetch(`${TERMINAL_ROUTE_PREFIX}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "graceful-stop" })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        setStopMessage(`\u5931\u8D25\uFF1A${body.error ?? `HTTP ${res.status}`}`);
      } else {
        setStopMessage(`\u5DF2\u5B8C\u6210\uFF1A${(body.steps ?? []).join(" \u2192 ")}`);
      }
    } catch (e) {
      setStopMessage(`\u5931\u8D25\uFF1A${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStopping(false);
    }
  };
  const status = snapshot?.status;
  const phase = status?.phase ?? "idle";
  const shown = filter ? log.filter((e) => e.text.toLowerCase().includes(filter.toLowerCase())) : log;
  return /* @__PURE__ */ React2.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        fontSize: 13,
        color: "var(--dsw-alias-label-primary, inherit)"
      }
    },
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 6px" } }, /* @__PURE__ */ React2.createElement(
      "button",
      {
        type: "button",
        onClick: () => props.onClose?.(),
        title: "\u8FD4\u56DE\u4F1A\u8BDD",
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 10px",
          borderRadius: 8,
          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "inherit",
          flex: "none"
        }
      },
      "\u2190 \u8FD4\u56DE\u4F1A\u8BDD"
    ), /* @__PURE__ */ React2.createElement(
      "span",
      {
        style: {
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: PHASE_COLOR[phase] ?? "#9e9e9e",
          flex: "none"
        }
      }
    ), /* @__PURE__ */ React2.createElement("strong", { style: { fontSize: 14 } }, TERMINAL_PANEL_LABEL), /* @__PURE__ */ React2.createElement("span", { style: { opacity: 0.7 } }, PHASE_TEXT[phase] ?? phase), status?.modelId && /* @__PURE__ */ React2.createElement("span", { style: { opacity: 0.85 } }, "\xB7 \u6A21\u578B ", status.modelId), status?.pid !== void 0 && /* @__PURE__ */ React2.createElement("span", { style: { opacity: 0.6 } }, "\xB7 pid ", status.pid), status?.mode && /* @__PURE__ */ React2.createElement("span", { style: { opacity: 0.6 } }, "\xB7 ", status.mode), /* @__PURE__ */ React2.createElement("span", { style: { marginLeft: "auto", opacity: 0.6, fontSize: 11 } }, connected ? "\u5B9E\u65F6\u8FDE\u63A5\u4E2D\uFF08SSE\uFF09" : "\u672A\u8FDE\u63A5\uFF08\u91CD\u8BD5\u4E2D\uFF09")),
    /* @__PURE__ */ React2.createElement(
      ModelSwitcher,
      {
        sessionId: props.sessionId,
        sessionList: props.sessionList,
        directoryFor: props.directoryFor,
        settings: props.settings,
        openNonce: props.openNonce
      }
    ),
    status?.error && /* @__PURE__ */ React2.createElement("div", { style: { margin: "0 14px 6px", color: "#e5484d", fontSize: 12 } }, status.error),
    /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          margin: "0 14px 8px",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.28))",
          background: "var(--dsw-alias-surface-l2, rgba(0,0,0,.03))",
          fontSize: 12,
          lineHeight: 1.6
        }
      },
      /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, marginBottom: 2 } }, "\u63D2\u4EF6\u4F5C\u7528\u56DE\u663E"),
      (snapshot?.purpose ?? []).map((line, i) => /* @__PURE__ */ React2.createElement("div", { key: i, style: { opacity: 0.85 } }, "\xB7 ", line)),
      !snapshot && /* @__PURE__ */ React2.createElement("div", { style: { opacity: 0.7 } }, "\u6B63\u5728\u83B7\u53D6\u5FEB\u7167\u2026")
    ),
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "0 14px 6px" } }, /* @__PURE__ */ React2.createElement(
      "input",
      {
        value: filter,
        placeholder: "\u8FC7\u6EE4\u8F93\u51FA\u2026",
        onChange: (e) => setFilter(e.target.value),
        style: {
          flex: 1,
          maxWidth: 260,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))",
          background: "transparent",
          color: "inherit",
          fontSize: 12,
          fontFamily: "inherit"
        }
      }
    ), /* @__PURE__ */ React2.createElement("label", { style: { display: "flex", alignItems: "center", gap: 4, fontSize: 12 } }, /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "checkbox",
        checked: follow,
        onChange: (e) => setFollow(e.target.checked)
      }
    ), "\u81EA\u52A8\u6EDA\u52A8"), /* @__PURE__ */ React2.createElement(
      "button",
      {
        type: "button",
        onClick: () => void gracefulStop(),
        disabled: stopping || phase === "idle" || phase === "stopping",
        title: "\u5411 llama-server \u53D1\u9001 Ctrl+C\uFF08SIGINT\uFF09\uFF0C\u968F\u540E\u53D1\u9001 Y \u786E\u8BA4\u9000\u51FA\uFF1B\u4E0D\u4F7F\u7528\u5F3A\u6740",
        style: {
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))",
          background: "transparent",
          color: "inherit",
          cursor: stopping ? "default" : "pointer",
          opacity: stopping || phase === "idle" || phase === "stopping" ? 0.5 : 1,
          fontSize: 12,
          fontFamily: "inherit",
          whiteSpace: "nowrap"
        }
      },
      stopping ? "\u9000\u51FA\u4E2D\u2026" : "\u4F18\u96C5\u9000\u51FA\uFF08Ctrl+C \u2192 Y\uFF09"
    ), /* @__PURE__ */ React2.createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          setLog([]);
        },
        style: {
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.35))",
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          fontSize: 12,
          fontFamily: "inherit"
        }
      },
      "\u6E05\u5C4F\uFF08\u4EC5\u672C\u5730\u89C6\u56FE\uFF09"
    ), /* @__PURE__ */ React2.createElement("span", { style: { opacity: 0.6, fontSize: 11 } }, shown.length, " \u884C", filter ? ` / \u5171 ${log.length}` : "")),
    stopMessage && /* @__PURE__ */ React2.createElement("div", { style: { margin: "0 14px 6px", fontSize: 12, opacity: 0.85 } }, stopMessage),
    error && /* @__PURE__ */ React2.createElement("div", { style: { margin: "0 14px 6px", color: "#e5484d", fontSize: 12 } }, error),
    /* @__PURE__ */ React2.createElement(
      "div",
      {
        ref: viewRef,
        style: {
          ...mono,
          flex: 1,
          minHeight: 120,
          margin: "0 14px 14px",
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--dsw-alias-border-l3, rgba(128,128,128,.28))",
          background: "var(--dsw-alias-surface-l2, rgba(0,0,0,.06))",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all"
        }
      },
      shown.length === 0 ? /* @__PURE__ */ React2.createElement("div", { style: { opacity: 0.6 } }, connected ? "\u6682\u65E0\u8F93\u51FA\u3002\u9009\u62E9 llama.cpp \u6A21\u578B\u5E76\u53D1\u9001\u6D88\u606F\u540E\uFF0C\u8FD9\u91CC\u4F1A\u663E\u793A llama-server \u7684\u542F\u52A8\u4E0E\u63A8\u7406\u65E5\u5FD7\u3002" : "\u6B63\u5728\u8FDE\u63A5 host \u6570\u636E\u9762\u2026") : shown.map((e) => /* @__PURE__ */ React2.createElement("div", { key: e.seq, style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React2.createElement("span", { style: { opacity: 0.45, flex: "none" } }, new Date(e.ts).toLocaleTimeString("zh-CN", { hour12: false })), /* @__PURE__ */ React2.createElement(
        "span",
        {
          style: {
            flex: "none",
            width: 52,
            opacity: 0.6,
            color: STREAM_COLOR[e.stream] ?? "inherit"
          }
        },
        e.stream
      ), /* @__PURE__ */ React2.createElement("span", { style: { color: STREAM_COLOR[e.stream] ?? "inherit" } }, e.text)))
    )
  );
}

// src/client/terminal-mount.ts
var SIDEBAR_SELECTOR = '[data-pane="sidebar"], [class*="sidebarCol"]';
var CONVERSATION_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]';
var FAMILY_SELECTOR = '[data-dsh-part="sidebar-entry"], [data-dsh-taskboard-entry]';
var SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]';
var ENTRY_ATTR = "data-dsh-llamacpp-terminal-entry";
var VIEW_ATTR = "data-dsh-llamacpp-terminal-view";
var ACTIVE_ATTR = "data-dsh-llamacpp-terminal-active";
var SIBLING_ACTIVE_ATTR = "data-dsh-taskboard-active";
var ACTIVATE_EVENT = "dsh-panel-activate";
var PANEL_NAME = "llamacpp-terminal";
var PANEL_CSS = `
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
function ensureStyles() {
  if (typeof document === "undefined") return;
  const id = "dsh-llamacpp-bridge/terminal-panel.css";
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`)) return;
  const tag = document.createElement("style");
  tag.setAttribute("data-plugin", "dsh-llamacpp-bridge");
  tag.setAttribute("data-plugin-css", id);
  tag.textContent = PANEL_CSS;
  document.head.appendChild(tag);
}
function sidebarRoot() {
  const column = document.querySelector(SIDEBAR_SELECTOR);
  if (!(column instanceof HTMLElement)) return void 0;
  const logo = column.querySelector('[class*="logoRow"]');
  const parent = logo?.parentElement;
  if (parent instanceof HTMLElement && parent !== column) return parent;
  return column.firstElementChild instanceof HTMLElement ? column.firstElementChild : column;
}
function newSessionButton(root) {
  const nested = root.querySelector('button[class*="newSession"]');
  if (nested instanceof HTMLElement) return nested;
  for (const child of Array.from(root.children)) {
    if (child.tagName === "BUTTON") return child;
  }
  return void 0;
}
function conversationColumn() {
  const el = document.querySelector(CONVERSATION_SELECTOR);
  return el instanceof HTMLElement ? el : void 0;
}
function createEntry(onToggle) {
  const entry = document.createElement("button");
  entry.type = "button";
  entry.setAttribute(ENTRY_ATTR, "");
  entry.setAttribute("data-dsh-plugin", "dsh-llamacpp-bridge");
  entry.setAttribute("data-dsh-part", "sidebar-entry");
  const iconSpan = document.createElement("span");
  iconSpan.className = "dsh-llamacpp-entry-icon";
  iconSpan.innerHTML = OLLAMA_ICON_SVG;
  const svg = iconSpan.querySelector("svg");
  if (svg) {
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
  }
  const labelSpan = document.createElement("span");
  labelSpan.className = "dsh-llamacpp-entry-label";
  entry.append(iconSpan, labelSpan);
  const applyLabel = () => {
    entry.setAttribute("aria-label", TERMINAL_PANEL_LABEL);
    entry.setAttribute("title", TERMINAL_PANEL_LABEL);
    labelSpan.textContent = TERMINAL_PANEL_LABEL;
  };
  applyLabel();
  entry.addEventListener("click", onToggle);
  return { entry, applyLabel };
}
function mountTerminalPanel(options = {}) {
  ensureStyles();
  let open = false;
  let openNonce = 0;
  let disposed = false;
  let panelRoot;
  let panelContainer;
  const { entry, applyLabel } = createEntry(() => toggle());
  const ensurePanel = () => {
    if (disposed) return;
    if (panelContainer && panelContainer.isConnected) return;
    panelRoot?.unmount();
    panelRoot = void 0;
    panelContainer?.remove();
    panelContainer = void 0;
    const column = conversationColumn();
    if (!column) return;
    const container = document.createElement("div");
    container.setAttribute(VIEW_ATTR, "");
    container.setAttribute("data-dsh-plugin", "dsh-llamacpp-bridge");
    column.appendChild(container);
    panelContainer = container;
    panelRoot = (0, import_client.createRoot)(container);
    panelRoot.render(
      React3.createElement(LlamaCppTerminalPanel, {
        directoryFor: options.directoryFor,
        settings: options.settings,
        sessionList: options.sessionList,
        onClose: () => setOpen(false)
      })
    );
  };
  const applyActive = () => {
    if (open) {
      openNonce += 1;
      ensurePanel();
      panelRoot?.render(
        React3.createElement(LlamaCppTerminalPanel, {
          directoryFor: options.directoryFor,
          settings: options.settings,
          sessionList: options.sessionList,
          openNonce,
          onClose: () => setOpen(false)
        })
      );
      document.documentElement.setAttribute(ACTIVE_ATTR, "");
      document.documentElement.removeAttribute(SIBLING_ACTIVE_ATTR);
      entry.setAttribute("data-active", "true");
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR);
      entry.removeAttribute("data-active");
    }
  };
  function setOpen(next) {
    if (open === next) return;
    open = next;
    applyActive();
  }
  function toggle() {
    setOpen(!open);
  }
  const onClickSidebarRow = (event) => {
    if (!open) return;
    const target = event.target;
    if (target && typeof target.closest === "function" && target.closest(SIDEBAR_ROW_SELECTOR)) {
      setOpen(false);
    }
  };
  const onOtherActivate = (event) => {
    const detail = event.detail;
    if (detail !== PANEL_NAME && open) setOpen(false);
  };
  const onKeyDown = (event) => {
    if (open && event.key === "Escape") setOpen(false);
  };
  if (typeof document !== "undefined") {
    document.addEventListener("click", onClickSidebarRow, true);
    document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
    document.addEventListener("keydown", onKeyDown);
  }
  let sidebarEl;
  let placed = false;
  const place = (container) => {
    const button = newSessionButton(container);
    if (!button) return false;
    if (entry.parentElement === container) return true;
    const logoRow = button.closest('[class*="logoRow"]');
    const base = logoRow instanceof HTMLElement && logoRow.parentElement === container ? logoRow : button;
    const family = Array.from(container.children).filter(
      (el) => el instanceof HTMLElement && el.matches(FAMILY_SELECTOR)
    );
    const lastFamily = family.length > 0 ? family[family.length - 1] : void 0;
    const anchor = lastFamily ? lastFamily.nextElementSibling : base.nextElementSibling;
    container.insertBefore(entry, anchor);
    return true;
  };
  const tryPlace = () => {
    if (disposed) return;
    if (sidebarEl && !sidebarEl.isConnected) {
      rootObserver.disconnect();
      sidebarEl = void 0;
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
      document.removeEventListener("click", onClickSidebarRow, true);
      document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.removeAttribute(ACTIVE_ATTR);
      panelRoot?.unmount();
      panelRoot = void 0;
      panelContainer?.remove();
      panelContainer = void 0;
      entry.remove();
    }
  };
}

// src/client/index.tsx
var inject = ["slots", "sessions"];
function apply(ctx) {
  const safeGet = (key) => {
    try {
      return ctx[key] ?? null;
    } catch {
      return null;
    }
  };
  const sessionsService = safeGet("sessions");
  const sessions = sessionsService?.list ?? null;
  const slots = safeGet("slots");
  if (!slots) {
    console.warn("[llamacpp-bridge] slots \u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u5BA2\u6237\u7AEF UI \u672A\u6CE8\u518C");
    return;
  }
  const optional = {
    modelDirectories: null,
    settings: null,
    discovery: null,
    workspaces: null
  };
  const injectOptional = ctx.inject;
  if (typeof injectOptional === "function") {
    injectOptional.call(ctx, ["modelDirectories", "settingsScope", "workspaces"], (scope) => {
      const get = (key) => {
        try {
          return scope[key] ?? null;
        } catch {
          return null;
        }
      };
      optional.modelDirectories = get("modelDirectories");
      optional.workspaces = get("workspaces");
      const binder = get("settingsScope");
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
    registerSettingsSection(ctx, optional);
  }
  const directoryFor = (sessionId) => {
    const dirs = optional.modelDirectories;
    if (!dirs) return null;
    try {
      return dirs.directoryFor(sessionId);
    } catch {
      return null;
    }
  };
  try {
    const mount = mountTerminalPanel({
      directoryFor,
      settings: optional.settings,
      sessionList: sessions ?? void 0
    });
    ctx.effect(() => () => mount.dispose());
  } catch (err) {
    console.warn("[llamacpp-bridge] terminal panel mount failed:", err);
  }
}
function registerSettingsSection(scope, optional) {
  try {
    const slots = scope.slots;
    slots.inject(
      "settings.section",
      () => slots.register(
        {
          name: "settings.section",
          id: "llamacpp",
          order: 12,
          label: () => "llama.cpp",
          inject: () => ({
            settings: optional.settings,
            discovery: optional.discovery,
            workspaces: optional.workspaces
          })
        },
        LlamaCppSettingsSection
      )
    );
  } catch (err) {
    console.warn("[llamacpp-bridge] settings section registration failed:", err);
  }
}
