#!/usr/bin/env node

/**
 * validate-ascii-spec.mjs
 *
 * S3B.25 门禁：核对 ASCII / 点彩粒子动效契约文件 `docs/design/ascii-animation-spec.json` 的结构完整性、
 * 渲染器性能阈值（DOM vs Canvas 切换判据）、1:1 粒子网格参数、无障碍退化档位、媒体源路径存在性，
 * 以及生产页面源码纯净度（严禁在页面 DOM 中渲染粒子大小滑块、预设切换按钮、视频切换器、快捷键提示或 FPS 面板 —— `debug-chrome-leak`）。
 *
 * 用法：
 *   node .agents/skills/ascii-animation-skill/scripts/validate-ascii-spec.mjs [docs/design/ascii-animation-spec.json] [--project-root <dir>] [--source <file-or-dir>] [--out <report.json>] [--json]
 *
 * 退出码：
 *   0 = 契约与源码纯净度均达标
 *   1 = 契约违例或检出 debug-chrome-leak（DOM 网格超预算、缺 reducedMotion 退化、缺 aria-label、页面残留调试滑块/按钮等）
 *   2 = 用法错误或找不到输入文件（未做出判定）
 */

import fs from "node:fs";
import path from "node:path";
import { guardArgs } from "../lib/arg-guard.mjs";

const USAGE =
  "Usage: node validate-ascii-spec.mjs [docs/design/ascii-animation-spec.json] [--project-root <dir>] [--source <file-or-dir>] [--out <report.json>] [--json]";

guardArgs({
  flags: ["--json", "--help"],
  valueFlags: ["--project-root", "--source", "--out"],
  maxPositional: 1,
  usage: USAGE,
});

const VALID_ROUTES = new Set([
  "live-media-matrix",
  "rune-frame-bundle",
  "procedural-piece",
  "pattern-background",
  "charvid-timeline",
]);

const VALID_RENDER_MODES = new Set(["auto", "canvas", "particles", "dom", "webgl"]);
const VALID_PARTICLE_STYLES = new Set(["dots", "diamonds", "voxels"]);
const VALID_ASPECT_FITS = new Set(["contain", "cover"]);
const VALID_LOOKS = new Set([
  "original",
  "code-matrix",
  "dots",
  "diamonds",
  "voxels",
  "ascii",
  "dense",
  "numbers",
  "binary",
  "blocks",
  "squares",
  "lines",
  "dither",
]);

/**
 * 生产页面禁止出现的调试控件 / 参数调节器特征规则集
 */
const DEBUG_CHROME_PATTERNS = [
  {
    id: "range-slider-control",
    regex: /<input[^>]*type=["']range["'][^>]*>/i,
    reason: "禁止在生产页面渲染 <input type=\"range\"> 颗粒度/尺寸调节滑块；参数须通过组件 Props 或 ascii-animation-spec.json 注入",
  },
  {
    id: "particle-size-hud",
    regex: /\bParticle\s+Size\s*:/i,
    reason: "禁止在生产页面渲染 'Particle Size:' 调试标签或档位面板",
  },
  {
    id: "particle-form-switcher",
    regex: /\bParticle\s+Form\s*:/i,
    reason: "禁止在生产页面渲染 'Particle Form:' 形态切换器按钮组",
  },
  {
    id: "video-clip-switcher",
    regex: /\bVideo\s+Clip\s*:/i,
    reason: "禁止在生产页面渲染 'Video Clip:' 演示视频源切换按钮",
  },
  {
    id: "preset-pill-bar",
    regex: /\bPresets\s*:\s*Fine\b|\bUltra-Fine\b.*\bChunky\b/is,
    reason: "禁止在生产页面渲染 'Presets: Fine / Bold / Chunky' 调试预设按钮栏",
  },
  {
    id: "keyboard-shortcut-hint",
    regex: /\bShortcuts\s*:\s*(?:\[|Press)/i,
    reason: "禁止在生产页面渲染 'Shortcuts: [1/2]...' 键盘调试快捷键提示栏",
  },
  {
    id: "fps-debug-counter",
    regex: /\bFPS\s*:\s*\{?\d|\bgrid\s*:\s*\d+\s*x\s*\d+\s*cells\b/i,
    reason: "禁止在生产页面渲染 FPS 计数器或网格调试 HUD",
  },
];

function collectSourceFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  const results = [];
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (/^(node_modules|\.next|\.git|dist|build)$/.test(entry.name)) continue;
      results.push(...collectSourceFiles(path.join(targetPath, entry.name)));
    } else if (/\.(tsx|jsx|ts|js|html)$/.test(entry.name)) {
      results.push(path.join(targetPath, entry.name));
    }
  }
  return results;
}

function scanSourceForDebugChrome(files, projectRoot) {
  const leaks = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(projectRoot, file).replace(/\\/g, "/");
    for (const rule of DEBUG_CHROME_PATTERNS) {
      if (rule.regex.test(content)) {
        leaks.push({
          ruleId: rule.id,
          file: rel,
          reason: rule.reason,
        });
      }
    }
  }
  return leaks;
}

function parseCli(argv) {
  let specPath = null;
  let projectRoot = process.cwd();
  let sourceTarget = null;
  let outPath = null;
  let asJson = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      asJson = true;
    } else if (arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === "--project-root") {
      projectRoot = path.resolve(argv[++i]);
    } else if (arg.startsWith("--project-root=")) {
      projectRoot = path.resolve(arg.slice("--project-root=".length));
    } else if (arg === "--source") {
      sourceTarget = argv[++i];
    } else if (arg.startsWith("--source=")) {
      sourceTarget = arg.slice("--source=".length);
    } else if (arg === "--out") {
      outPath = argv[++i];
    } else if (arg.startsWith("--out=")) {
      outPath = arg.slice("--out=".length);
    } else if (!arg.startsWith("-")) {
      specPath = arg;
    }
  }

  const resolvedSpec = specPath
    ? path.resolve(projectRoot, specPath)
    : path.join(projectRoot, "docs/design/ascii-animation-spec.json");

  return { resolvedSpec, projectRoot, sourceTarget, outPath, asJson };
}

function main() {
  const { resolvedSpec, projectRoot, sourceTarget, outPath, asJson } = parseCli(
    process.argv.slice(2),
  );

  if (!fs.existsSync(resolvedSpec)) {
    const msg = `拿不到，无法判定: ASCII spec not found at ${resolvedSpec}`;
    if (asJson) {
      console.log(JSON.stringify({ ok: false, unmeasured: true, error: msg }, null, 2));
    } else {
      console.error(msg);
    }
    process.exit(2);
  }

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(resolvedSpec, "utf8"));
  } catch (err) {
    const msg = `拿不到，无法判定: Invalid JSON in ${resolvedSpec}: ${err instanceof Error ? err.message : String(err)}`;
    if (asJson) {
      console.log(JSON.stringify({ ok: false, unmeasured: true, error: msg }, null, 2));
    } else {
      console.error(msg);
    }
    process.exit(2);
  }

  if (sourceTarget) {
    const resolvedSource = path.resolve(projectRoot, sourceTarget);
    if (!fs.existsSync(resolvedSource)) {
      const msg = `拿不到，无法判定: 指定的 --source 不存在 ${resolvedSource}`;
      if (asJson) {
        console.log(JSON.stringify({ ok: false, unmeasured: true, error: msg }, null, 2));
      } else {
        console.error(msg);
      }
      process.exit(2);
    }
  }

  const errors = [];
  const warnings = [];

  if (spec.version !== 1) {
    errors.push(`version must be 1 (got ${JSON.stringify(spec.version)})`);
  }

  if (!spec.route || !VALID_ROUTES.has(spec.route)) {
    errors.push(
      `route must be one of [${[...VALID_ROUTES].join(", ")}] (got ${JSON.stringify(spec.route)})`,
    );
  }

  const grid = spec.grid;
  if (!grid || typeof grid !== "object") {
    errors.push("missing required object: grid");
  } else {
    const cols = Number(grid.columns);
    const rows = Number(grid.rows);
    const fps = Number(grid.fps ?? 24);
    const renderMode = grid.renderMode ?? "auto";
    const fontRatio = Number(grid.fontRatio ?? (renderMode === "particles" ? 1.0 : 0.6));

    if (!Number.isInteger(cols) || cols < 10 || cols > 400) {
      errors.push(`grid.columns must be an integer between 10 and 400 (got ${grid.columns})`);
    }
    if (!Number.isInteger(rows) || rows < 5 || rows > 300) {
      errors.push(`grid.rows must be an integer between 5 and 300 (got ${grid.rows})`);
    }
    if (!Number.isFinite(fps) || fps < 0 || fps > 60) {
      errors.push(`grid.fps must be between 0 and 60 (got ${grid.fps})`);
    }
    const maxFontRatio = renderMode === "particles" ? 1.0 : 0.75;
    if (!Number.isFinite(fontRatio) || fontRatio < 0.45 || fontRatio > maxFontRatio) {
      errors.push(
        `grid.fontRatio must be between 0.45 and ${maxFontRatio} (got ${grid.fontRatio})`,
      );
    }
    if (!VALID_RENDER_MODES.has(renderMode)) {
      errors.push(
        `grid.renderMode must be one of [${[...VALID_RENDER_MODES].join(", ")}] (got ${renderMode})`,
      );
    }

    if (renderMode === "particles") {
      if (grid.particleSize !== undefined) {
        const pSize = Number(grid.particleSize);
        if (!Number.isFinite(pSize) || pSize < 3.5 || pSize > 18) {
          errors.push(`grid.particleSize must be between 3.5 and 18 (got ${grid.particleSize})`);
        }
      }
      if (grid.particleStyle !== undefined && !VALID_PARTICLE_STYLES.has(grid.particleStyle)) {
        errors.push(
          `grid.particleStyle must be one of [${[...VALID_PARTICLE_STYLES].join(", ")}] (got ${grid.particleStyle})`,
        );
      }
      if (grid.aspectFit !== undefined && !VALID_ASPECT_FITS.has(grid.aspectFit)) {
        errors.push(
          `grid.aspectFit must be one of [${[...VALID_ASPECT_FITS].join(", ")}] (got ${grid.aspectFit})`,
        );
      }
    }

    const cellCount = cols * rows;
    if (renderMode === "dom" && (cellCount >= 12000 || cols >= 140)) {
      errors.push(
        `grid.renderMode="dom" is prohibited when cellCount (${cellCount}) >= 12000 or columns (${cols}) >= 140 (Rune renderer.ts threshold); use "canvas", "particles", or "auto"`,
      );
    }
    if (spec.route === "live-media-matrix" && renderMode === "dom") {
      errors.push(
        `route="live-media-matrix" requires "canvas", "particles", or "auto" renderMode for 60fps video sampling`,
      );
    }
  }

  if (spec.look && !VALID_LOOKS.has(spec.look)) {
    errors.push(
      `look must be one of [${[...VALID_LOOKS].join(", ")}] (got ${JSON.stringify(spec.look)})`,
    );
  }

  if (spec.mediaSource && typeof spec.mediaSource === "string") {
    if (spec.mediaSource.startsWith("/")) {
      const localPath = path.join(projectRoot, "public", spec.mediaSource.slice(1));
      if (!fs.existsSync(localPath)) {
        errors.push(`mediaSource "${spec.mediaSource}" does not exist at ${localPath}`);
      }
    }
  } else if (spec.route === "live-media-matrix") {
    warnings.push(
      `route="live-media-matrix" has no mediaSource specified; component will fall back to ambient code/noise matrix`,
    );
  }

  const degrade = spec.degrade;
  if (!degrade || typeof degrade !== "object") {
    errors.push("missing required object: degrade (must specify reducedMotion and noJS)");
  } else {
    if (!degrade.reducedMotion || typeof degrade.reducedMotion !== "string") {
      errors.push("degrade.reducedMotion must be a non-empty string policy (e.g. 'still-frame')");
    }
    if (!degrade.noJS || typeof degrade.noJS !== "string") {
      errors.push("degrade.noJS must be a non-empty string policy (e.g. 'static-poster-or-pre')");
    }
  }

  const a11y = spec.accessibility;
  if (!a11y || typeof a11y !== "object") {
    errors.push("missing required object: accessibility");
  } else {
    if (a11y.role !== "img" && a11y.ariaHidden !== true) {
      errors.push('accessibility must declare either role="img" with ariaLabel or ariaHidden=true');
    }
    if (a11y.role === "img" && (!a11y.ariaLabel || String(a11y.ariaLabel).trim().length < 3)) {
      errors.push('accessibility.ariaLabel must be at least 3 characters when role="img"');
    }
  }

  // Production Page Purity Gate: scan --source or spec.entryPoint for forbidden in-page UI controls
  const candidateTargets = [];
  if (sourceTarget) {
    candidateTargets.push(path.resolve(projectRoot, sourceTarget));
  } else if (spec.entryPoint && typeof spec.entryPoint === "string") {
    const ep = path.resolve(projectRoot, path.dirname(resolvedSpec), spec.entryPoint);
    const rootEp = path.resolve(projectRoot, spec.entryPoint);
    if (fs.existsSync(rootEp)) candidateTargets.push(rootEp);
    else if (fs.existsSync(ep)) candidateTargets.push(ep);
  }

  const filesToScan = [];
  for (const t of candidateTargets) {
    filesToScan.push(...collectSourceFiles(t));
  }
  const debugLeaks = scanSourceForDebugChrome(filesToScan, projectRoot);
  for (const leak of debugLeaks) {
    errors.push(
      `[debug-chrome-leak:${leak.ruleId}] ${leak.file} — ${leak.reason}`,
    );
  }

  const ok = errors.length === 0;
  const report = {
    version: 1,
    ok,
    spec: path.relative(projectRoot, resolvedSpec).replace(/\\/g, "/"),
    route: spec.route ?? null,
    renderMode: grid?.renderMode ?? "auto",
    cellCount: grid ? Number(grid.columns) * Number(grid.rows) : null,
    scannedSourceFiles: filesToScan.length,
    debugChromeLeaks: debugLeaks,
    errors,
    warnings,
  };

  if (outPath) {
    const dest = path.resolve(outPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (ok) {
      console.log(
        `PASS ${report.spec} (route=${report.route}, renderMode=${report.renderMode}, cells=${report.cellCount}, scannedFiles=${report.scannedSourceFiles})`,
      );
      for (const w of warnings) console.log(`  WARN: ${w}`);
    } else {
      console.error(`FAIL ${report.spec}`);
      for (const e of errors) console.error(`  ERROR: ${e}`);
      for (const w of warnings) console.error(`  WARN: ${w}`);
    }
  }

  process.exit(ok ? 0 : 1);
}

main();
