/**
 * 把 esbuild 产出的 CJS bundle 包进 DSH 客户端模块装载器契约：
 * window.__ModuleLoader__.load({ id, factory: (require) => {...} })
 * factory 返回 module.exports（含 apply/inject）。
 * 依据：dsh-client-modules README（懒 CJS 模型）与 dsh-pocket 客户端包同形。
 */
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const code = readFileSync(new URL('../dist/client/bundle.cjs', import.meta.url), 'utf8');
const out = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  }
});
`;
writeFileSync(new URL('../dist/client/index.js', import.meta.url), out);
console.log(`wrapped ${pkg.name} client bundle -> dist/client/index.js (${out.length} bytes)`);
