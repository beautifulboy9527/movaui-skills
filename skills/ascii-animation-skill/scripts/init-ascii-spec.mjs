#!/usr/bin/env node

/**
 * init-ascii-spec.mjs
 *
 * 初始化 `docs/design/ascii-animation-spec.json` 契约骨架（S3B.25）。
 * 自动探测或通过 `--brand-ip` 读取 `docs/brand/brand-ip.json` 的强调色，
 * 避免硬编码任何参考站品牌色；所有颗粒度/尺寸/形态均写入契约，严禁在生产页面渲染调节器 UI。
 *
 * 用法：
 *   node .agents/skills/ascii-animation-skill/scripts/init-ascii-spec.mjs [--out docs/design/ascii-animation-spec.json] [--route live-media-matrix] [--render-mode particles] [--particle-size 8.5] [--particle-style dots] [--media-source /videos/hero.mp4] [--brand-ip docs/brand/brand-ip.json] [--entry-point src/components/ascii-media-canvas.tsx] [--force] [--json]
 *
 * 退出码：
 *   0 = 成功生成契约文件
 *   1 = 目标文件已存在且未加 --force
 *   2 = 参数错误或指定的 --brand-ip 文件不存在
 */

import fs from "node:fs";
import path from "node:path";
import { guardArgs } from "../lib/arg-guard.mjs";

const USAGE =
  "Usage: node init-ascii-spec.mjs [--out <path>] [--route <route>] [--render-mode <canvas|particles|auto|dom|webgl>] [--particle-size <number>] [--particle-style <dots|diamonds|voxels>] [--media-source <url>] [--brand-ip <path>] [--entry-point <path>] [--force] [--json]";

guardArgs({
  flags: ["--force", "--json", "--help"],
  valueFlags: [
    "--out",
    "--route",
    "--render-mode",
    "--particle-size",
    "--particle-style",
    "--media-source",
    "--brand-ip",
    "--entry-point",
  ],
  maxPositional: 1,
  usage: USAGE,
});

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}

const getVal = (flag, fallback) => {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1] && !args[i + 1].startsWith("-")) {
      return args[i + 1];
    }
    if (args[i].startsWith(`${flag}=`)) {
      return args[i].slice(flag.length + 1);
    }
  }
  return fallback;
};

const positionalOut = args.find((a, idx) => {
  if (a.startsWith("-")) return false;
  const prev = idx > 0 ? args[idx - 1] : "";
  return !prev.startsWith("--") || prev === "--force" || prev === "--json";
});

const outPath = path.resolve(getVal("--out", positionalOut || "docs/design/ascii-animation-spec.json"));
const route = getVal("--route", "live-media-matrix");
const renderMode = getVal("--render-mode", "particles");
const particleSize = Number(getVal("--particle-size", "8.5"));
const particleStyle = getVal("--particle-style", "dots");
const mediaSource = getVal("--media-source", "");
const entryPoint = getVal("--entry-point", "src/components/ascii-media-canvas.tsx");
const explicitBrandIp = getVal("--brand-ip", null);
const force = args.includes("--force");
const asJson = args.includes("--json");

let phosphorColor = "#33FF66";
const brandIpPath = explicitBrandIp
  ? path.resolve(explicitBrandIp)
  : path.resolve("docs/brand/brand-ip.json");

if (explicitBrandIp && !fs.existsSync(brandIpPath)) {
  const msg = `拿不到，无法判定: 指定的 --brand-ip 文件不存在 ${brandIpPath}`;
  if (asJson) {
    console.log(JSON.stringify({ ok: false, unmeasured: true, error: msg }, null, 2));
  } else {
    console.error(msg);
  }
  process.exit(2);
}

if (fs.existsSync(brandIpPath)) {
  try {
    const brandIp = JSON.parse(fs.readFileSync(brandIpPath, "utf8"));
    const accent =
      brandIp?.palette?.accent ||
      brandIp?.palette?.primary ||
      brandIp?.colors?.accent ||
      brandIp?.palette?.fg;
    if (typeof accent === "string" && /^#[0-9a-fA-F]{6}$/.test(accent.trim())) {
      phosphorColor = accent.trim();
    }
  } catch {
    // ignore malformed optional brand-ip when not explicitly required
  }
}

if (fs.existsSync(outPath) && !force) {
  const msg = `目标契约已存在: ${outPath}（如需覆盖请传 --force）`;
  if (asJson) {
    console.log(JSON.stringify({ ok: false, error: msg, path: outPath }, null, 2));
  } else {
    console.error(msg);
  }
  process.exit(1);
}

const isParticles = renderMode === "particles";
const spec = {
  version: 1,
  route,
  ...(mediaSource ? { mediaSource } : {}),
  entryPoint,
  colorMode: "color",
  phosphorColor,
  patternMode: isParticles ? "dots" : "code-matrix",
  look: isParticles ? "dots" : "code-matrix",
  grid: {
    columns: 120,
    rows: 68,
    fps: 30,
    fontRatio: isParticles ? 1.0 : 0.6,
    renderMode,
    ...(isParticles
      ? {
          particleSize,
          particleStyle,
          aspectFit: "contain",
        }
      : {}),
  },
  purityPolicy: {
    forbidInPageControls: true,
    forbidFpsHud: true,
    forbidShortcutOverlay: true,
  },
  degrade: {
    reducedMotion: "still-frame",
    noJS: "static-poster-or-pre",
  },
  accessibility: {
    role: "img",
    ariaLabel: "Animated visual stage",
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        path: path.relative(process.cwd(), outPath).replace(/\\/g, "/"),
        route,
        renderMode,
        phosphorColor,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`已生成 ASCII/粒子动效契约: ${outPath} (renderMode=${renderMode}, phosphorColor=${phosphorColor})`);
}
