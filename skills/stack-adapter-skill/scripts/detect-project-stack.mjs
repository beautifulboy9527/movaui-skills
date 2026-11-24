#!/usr/bin/env node
/**
 * @file detect-project-stack.mjs
 * @description S0.8 —— 异构前端项目技术栈嗅探与冲突诊断器（Standalone & Pipeline 通用）
 *
 * 读取目标工程的 package.json、构建/路由配置、tsconfig 路径别名与全局 CSS，
 * 输出结构化的技术栈指纹与适配规则；在 --strict 模式下若检出致命混用冲突
 * （例如同一工程 CSS 同时混写 Tailwind v3 `@tailwind` 与 Tailwind v4 `@import "tailwindcss"`）
 * 则返回 exit 1。
 *
 * Exit codes:
 *   0 = 嗅探完成（无冲突，或非 strict 模式下仅告警）
 *   1 = --strict 模式下检出技术栈配置冲突
 *   2 = 参数非法或目标工程目录不存在
 *
 * Usage:
 *   node .agents/skills/stack-adapter-skill/scripts/detect-project-stack.mjs
 *     [--project-root <dir>] [--out <path>] [--strict] [--json]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { guardArgs } from "../lib/arg-guard.mjs";

const USAGE =
  "Usage: node detect-project-stack.mjs [--project-root <dir>] [--out <path>] [--strict] [--json]";

guardArgs({
  flags: ["--strict", "--json", "--help", "-h"],
  valueFlags: ["--project-root", "--out"],
  maxPositional: 0,
  usage: USAGE,
});

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const getVal = (flag, fallback = null) => {
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : fallback;
};

const asJson = args.includes("--json");
const strict = args.includes("--strict");
const rootDir = path.resolve(process.cwd(), getVal("--project-root", "."));
const outArg = getVal("--out", null);

if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
  console.error(`NOT VERIFIED: project root does not exist or is not a directory: ${rootDir}`);
  process.exit(2);
}

function readJsonSafe(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function findCssFiles(dir, depth = 0, acc = []) {
  if (depth > 3 || !fs.existsSync(dir)) return acc;
  const skip = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "fixtures", "vendor"]);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findCssFiles(full, depth + 1, acc);
    else if (e.name.endsWith(".css")) acc.push(full);
  }
  return acc;
}

const pkg = readJsonSafe(path.join(rootDir, "package.json")) || {};
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

const hasDep = (name) => Object.prototype.hasOwnProperty.call(deps, name);
const depVer = (name) => String(deps[name] || "");

// 1. Framework & Router detection
let framework = "vanilla";
let router = "static-html";
let ssrBoundary = "client-only";

if (hasDep("next")) {
  framework = "nextjs";
  const hasApp =
    fs.existsSync(path.join(rootDir, "src", "app")) || fs.existsSync(path.join(rootDir, "app"));
  const hasPages =
    fs.existsSync(path.join(rootDir, "src", "pages")) || fs.existsSync(path.join(rootDir, "pages"));
  router = hasApp && hasPages ? "nextjs-hybrid-app-pages" : hasApp ? "nextjs-app-router" : "nextjs-pages-router";
  ssrBoundary = hasApp ? "rsc-use-client-required" : "ssr-hydration-guarded";
} else if (hasDep("astro")) {
  framework = "astro";
  router = "astro-file-routing";
  ssrBoundary = "astro-islands-client-directive";
} else if (hasDep("nuxt")) {
  framework = "nuxt";
  router = "nuxt-pages";
  ssrBoundary = "ssr-hydration-guarded";
} else if (hasDep("@sveltejs/kit")) {
  framework = "sveltekit";
  router = "sveltekit-routes";
  ssrBoundary = "ssr-hydration-guarded";
} else if (hasDep("vite") && hasDep("react")) {
  framework = "vite-react";
  router = hasDep("react-router-dom") || hasDep("react-router") ? "react-router" : "spa-custom";
  ssrBoundary = "client-spa";
} else if (hasDep("vue")) {
  framework = "vue";
  router = hasDep("vue-router") ? "vue-router" : "spa-custom";
  ssrBoundary = "client-spa";
} else if (hasDep("react")) {
  framework = "react";
  router = "custom";
  ssrBoundary = "client-spa";
}

// 2. CSS Engine detection
const cssFiles = findCssFiles(rootDir).slice(0, 25);
let sawTwV4Import = false;
let sawTwV3Directive = false;
let sawCustomThemeVars = false;

for (const cf of cssFiles) {
  const txt = fs.readFileSync(cf, "utf8");
  if (/@import\s+["']tailwindcss["']|@theme\b/.test(txt)) sawTwV4Import = true;
  if (/@tailwind\s+(?:base|components|utilities)\b/.test(txt)) sawTwV3Directive = true;
  if (/--(?:bg-|fg-|brand|color-|surface-)/.test(txt)) sawCustomThemeVars = true;
}

const twVer = depVer("tailwindcss");
let cssEngine = "vanilla-css";
if (sawTwV4Import || /^[\^~]?4\./.test(twVer) || hasDep("@tailwindcss/vite") || hasDep("@tailwindcss/postcss")) {
  cssEngine = "tailwind-v4";
} else if (sawTwV3Directive || /^[\^~]?3\./.test(twVer)) {
  cssEngine = "tailwind-v3";
}

// 3. Motion & Icon libraries
const motionLibs = [];
if (hasDep("motion")) motionLibs.push({ pkg: "motion", importPath: "motion/react" });
if (hasDep("framer-motion")) motionLibs.push({ pkg: "framer-motion", importPath: "framer-motion" });
if (hasDep("gsap")) motionLibs.push({ pkg: "gsap", importPath: "gsap" });
if (hasDep("lenis") || hasDep("@studio-freight/lenis")) {
  motionLibs.push({ pkg: hasDep("lenis") ? "lenis" : "@studio-freight/lenis", importPath: hasDep("lenis") ? "lenis" : "@studio-freight/lenis" });
}
if (hasDep("three")) motionLibs.push({ pkg: "three", importPath: "three" });

const iconLibs = ["lucide-react", "@heroicons/react", "@phosphor-icons/react", "@radix-ui/react-icons"].filter(hasDep);

// 4. Path aliases
const tsconfig = readJsonSafe(path.join(rootDir, "tsconfig.json")) || readJsonSafe(path.join(rootDir, "jsconfig.json"));
const pathAliases = tsconfig?.compilerOptions?.paths || {};

const conflicts = [];
const warnings = [];

if (sawTwV4Import && sawTwV3Directive) {
  conflicts.push({
    code: "tailwind-v3-v4-directive-collision",
    message: "Detected both Tailwind v4 (`@import 'tailwindcss'` / `@theme`) and Tailwind v3 (`@tailwind base/utilities`) directives in project CSS.",
  });
}
if (hasDep("motion") && hasDep("framer-motion")) {
  warnings.push({
    code: "dual-motion-packages",
    message: "Both `motion` and `framer-motion` are installed; standardize imports to match existing components so MotionContext is shared.",
  });
}

const adapterDirectives = [];
if (framework === "nextjs" && router.includes("app")) {
  adapterDirectives.push('Add `"use client"` at line 1 of any component using hooks, browser APIs, or interactive motion.');
} else if (framework !== "nextjs") {
  adapterDirectives.push("Do NOT import `next/link`, `next/image`, or `next/navigation`; use host router primitives or semantic HTML.");
}
if (cssEngine === "tailwind-v4") {
  adapterDirectives.push("Use CSS-first `@theme` or `:root` custom properties; never override `--spacing-*` inside `@theme`.");
} else if (cssEngine === "tailwind-v3") {
  adapterDirectives.push("Do NOT emit `@theme` blocks; define CSS variables in `:root` and map utilities via `tailwind.config` or arbitrary values.");
} else {
  adapterDirectives.push("Tailwind CSS is not installed; emit clean scoped CSS custom properties instead of utility classes.");
}
if (motionLibs.length === 0) {
  adapterDirectives.push("No JS motion library installed; prefer zero-dependency CSS transitions (`transform`, `opacity`) unless asked to install one.");
} else {
  adapterDirectives.push(`Use installed motion import path: \`${motionLibs[0].importPath}\`.`);
}

const report = {
  gate: "S0.8",
  skill: "stack-adapter-skill",
  project_root: rootDir,
  verdict: strict && conflicts.length > 0 ? "failed" : "passed",
  adapters: {
    framework,
    router,
    ssr_boundary: ssrBoundary,
    css_engine: cssEngine,
    has_theme_css_vars: sawCustomThemeVars,
    motion_libs: motionLibs,
    icon_libs: iconLibs,
    path_aliases: Object.keys(pathAliases),
    typescript: fs.existsSync(path.join(rootDir, "tsconfig.json")),
  },
  directives: adapterDirectives,
  conflicts,
  warnings,
};

if (outArg) {
  const absOut = path.resolve(process.cwd(), outArg);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, JSON.stringify(report, null, 2) + "\n", "utf8");
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Stack fingerprint (${rootDir}): ${framework} | ${router} | ${cssEngine}`);
  for (const d of adapterDirectives) console.log(`  • ${d}`);
  for (const c of conflicts) console.error(`  ✗ [${c.code}] ${c.message}`);
  for (const w of warnings) console.warn(`  ! [${w.code}] ${w.message}`);
}

process.exit(strict && conflicts.length > 0 ? 1 : 0);
