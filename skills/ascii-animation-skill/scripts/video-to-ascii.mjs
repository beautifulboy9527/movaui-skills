#!/usr/bin/env node

/**
 * video-to-ascii.mjs
 *
 * 将本地视频 (.mp4/.webm/.mov) 或内置程序化预设
 * (donut | torus3d | matrix | perlin | wave | scatter; "wave" kept as alias of "wave")
 * 转换为：
 *   1. Rune 兼容的 `.rune.json` 帧包 (--output)
 *   2. 单文件自包含磷光 CRT `.html` 播放器 (--html，源自 GordenSun/asciivideo)
 *   3. 零 JS 纯 CSS 动画 `.svg` (--svg，源自 bas3line/ascii src/svg.ts)
 *
 * 融合算法：
 *   - zeke-john/rune: 四边连通泛洪抠像 (Border-Connected Flood Fill) + 帧间迟滞与 1px 膨胀防闪烁
 *   - kailashsr38/ascii-magic-art: 多字符集 Look 阶梯 (ascii / dense / dots / blocks / binary)
 *   - bas3line/ascii: 3D Z-buffer 圆环法线光照 + 零 JS CSS @keyframes 动画 SVG 导出
 *   - GordenSun/asciivideo: 确定性 scatter 飞入聚合与磷光 CRT 双层发光 HTML 播放器
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { guardArgs } from "../lib/arg-guard.mjs";

guardArgs({
  flags: ["--no-colored", "--json", "--help"],
  valueFlags: [
    "--accent",
    "--bg",
    "--input",
    "--preset",
    "--output",
    "--html",
    "--svg",
    "--name",
    "--columns",
    "--fps",
    "--max-frames",
    "--font-ratio",
    "--look",
    "--chars",
    "--threshold-low",
    "--threshold-high",
    "--mask-hysteresis",
    "--color-step",
  ],
  maxPositional: 0,
  usage:
    "Usage: node video-to-ascii.mjs [--input <video> | --preset <donut|torus3d|matrix|perlin|wave|scatter>] --output <file.rune.json> [options]",
});

const KNOWN_FLAGS = new Set([
  "--accent",
  "--bg",
  "--input",
  "--preset",
  "--output",
  "--html",
  "--svg",
  "--name",
  "--columns",
  "--fps",
  "--max-frames",
  "--font-ratio",
  "--look",
  "--chars",
  "--threshold-low",
  "--threshold-high",
  "--mask-hysteresis",
  "--color-step",
  "--no-colored",
  "--json",
  "--help",
]);

const LOOK_RAMPS = {
  ascii: " -=+*%#0oOxX@$",
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  dots: " ·•●",
  blocks: " ░▒▓█",
  binary: " 01",
  numbers: " 1723456980",
};

function printUsage() {
  console.log(
    [
      "Usage: node video-to-ascii.mjs [--input <video> | --preset <donut|torus3d|matrix|perlin|wave|scatter>] --output <file.rune.json> [options]",
      "",
      "Options:",
      "  --input <path>           Source video (.mp4, .webm, .mov) decoded via ffmpeg rawvideo pipe",
      "  --preset <name>          Procedural generator: donut | torus3d | matrix | perlin | wave | scatter",
      "  --accent <hex>           Phosphor/accent color, hex WITHOUT # (default: 33ff66 terminal green)",
      "  --bg <hex>               Background color for svg/html outputs, hex WITHOUT # (default: 050505)",
      "  --output <path>          Output .rune.json path",
      "  --html <path>            Optional standalone Phosphor CRT HTML preview path",
      "  --svg <path>             Optional Zero-JS animated SVG path (ascii.rest/svg style)",
      "  --name <id>              Animation name in metadata",
      "  --columns <int>          Grid width in characters (default: 80)",
      "  --fps <int>              Target frame rate (default: 20)",
      "  --max-frames <int>       Maximum frames to extract/generate (default: 48)",
      "  --font-ratio <float>     Character width/height ratio (default: 0.6)",
      "  --look <name>            Character ramp preset: ascii | dense | dots | blocks | binary | numbers",
      "  --chars <string>         Custom light-to-dark character ramp",
      "  --threshold-low <int>    Dark background luminance floor 0-255 (default: 10)",
      "  --threshold-high <int>   Light background luminance ceiling 0-255 (default: 224)",
      "  --mask-hysteresis <int>  Temporal mask stabilization margin (default: 6)",
      "  --color-step <int>       RGB quantization step (default: 8)",
      "  --no-colored             Output monochrome frames",
      "  --json                   Print machine-readable summary",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const opts = {
    input: null,
    preset: null,
    output: null,
    html: null,
    svg: null,
    name: null,
    columns: 80,
    fps: 20,
    maxFrames: 48,
    fontRatio: 0.6,
    look: "ascii",
    chars: null,
    thresholdLow: 10,
    thresholdHigh: 224,
    maskHysteresis: 6,
    colorStep: 8,
    colored: true,
    accent: "33ff66",
    bg: "050505",
    asJson: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!KNOWN_FLAGS.has(arg)) {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(2);
    }
    if (arg === "--help") {
      printUsage();
      process.exit(0);
    }
    if (arg === "--no-colored") {
      opts.colored = false;
      continue;
    }
    if (arg === "--json") {
      opts.asJson = true;
      continue;
    }
    const val = argv[++i];
    if (val === undefined || val.startsWith("--")) {
      console.error(`Missing value for ${arg}`);
      process.exit(2);
    }
    switch (arg) {
      case "--input":
        opts.input = val;
        break;
      case "--preset":
        opts.preset = val;
        break;
      case "--output":
        opts.output = val;
        break;
      case "--html":
        opts.html = val;
        break;
      case "--svg":
        opts.svg = val;
        break;
      case "--name":
        opts.name = val;
        break;
      case "--columns":
        opts.columns = Number.parseInt(val, 10);
        break;
      case "--fps":
        opts.fps = Number.parseInt(val, 10);
        break;
      case "--max-frames":
        opts.maxFrames = Number.parseInt(val, 10);
        break;
      case "--font-ratio":
        opts.fontRatio = Number.parseFloat(val);
        break;
      case "--look":
        opts.look = val;
        break;
      case "--chars":
        opts.chars = val;
        break;
      case "--threshold-low":
        opts.thresholdLow = Number.parseInt(val, 10);
        break;
      case "--threshold-high":
        opts.thresholdHigh = Number.parseInt(val, 10);
        break;
      case "--mask-hysteresis":
        opts.maskHysteresis = Number.parseInt(val, 10);
        break;
      case "--color-step":
        opts.colorStep = Number.parseInt(val, 10);
        break;
      case "--accent":
        opts.accent = val.replace(/^#/, "").toLowerCase();
        break;
      case "--bg":
        opts.bg = val.replace(/^#/, "").toLowerCase();
        break;
    }
  }
  if (!/^[0-9a-f]{6}$/.test(opts.accent) || !/^[0-9a-f]{6}$/.test(opts.bg)) {
    console.error("--accent/--bg expect 6-digit hex (with or without #)");
    process.exit(2);
  }
  return opts;
}

// Accent shade helpers: derive a generator palette from ONE accent color so the
// default look is genre-neutral (terminal green) instead of any specific site's brand.
function hexToRgb(hex) {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return c(r) + c(g) + c(b);
}
function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
// Module-level output theme (set in main() from --accent/--bg; the SVG/HTML
// template builders do not receive opts, and generated HTML bakes literals).
let ACCENT = "33ff66";
let DBG = "050505";
function hexToRgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// 深浅 ramp (dark -> accent -> light) + 热色 (accent 向白/橙偏移), 供程序化生成器使用
function accentPalette(accent) {
  const dark = mix("000000", accent, 0.45);
  return [dark, mix("000000", accent, 0.7), accent, mix(accent, "ffffff", 0.35), mix(accent, "ffffff", 0.65), mix(accent, "ffffff", 0.85), mix(accent, "ffffff", 0.93), mix(accent, "ffaa00", 0.55)];
}

function luminance(r, g, b) {
  return Math.floor(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

function quantize(v, step) {
  if (step <= 1) return v;
  return Math.max(0, Math.min(255, Math.round(v / step) * step));
}

function computeBorderConnectedMask(candidateMask, rows, cols) {
  const mask = new Uint8Array(candidateMask.length);
  const queue = new Uint32Array(candidateMask.length);
  let head = 0;
  let tail = 0;

  const enqueue = (idx) => {
    if (candidateMask[idx] !== 1 || mask[idx] === 1) return;
    mask[idx] = 1;
    queue[tail++] = idx;
  };

  for (let c = 0; c < cols; c++) {
    enqueue(c);
    enqueue((rows - 1) * cols + c);
  }
  for (let r = 0; r < rows; r++) {
    enqueue(r * cols);
    enqueue(r * cols + (cols - 1));
  }

  while (head < tail) {
    const idx = queue[head++];
    const r = Math.floor(idx / cols);
    const c = idx - r * cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          enqueue(nr * cols + nc);
        }
      }
    }
  }
  return mask;
}

function convertRgbFrameToAscii(rgbBuffer, cols, rows, opts, prevState) {
  const total = cols * rows;
  const lumGrid = new Uint8Array(total);
  let topRowLumSum = 0;
  const sampleCount = Math.min(cols, 10);

  for (let i = 0; i < total; i++) {
    const r = rgbBuffer[i * 3];
    const g = rgbBuffer[i * 3 + 1];
    const b = rgbBuffer[i * 3 + 2];
    const l = luminance(r, g, b);
    lumGrid[i] = l;
    if (i < sampleCount) topRowLumSum += l;
  }

  const bg = sampleCount > 0 && topRowLumSum / sampleCount > 200 ? "light" : "dark";
  const candidateMask = new Uint8Array(total);
  const prevMask =
    prevState && prevState.bg === bg && prevState.cols === cols && prevState.rows === rows
      ? prevState.finalMask
      : null;

  for (let i = 0; i < total; i++) {
    const l = lumGrid[i];
    if (bg === "dark") {
      const thresh =
        prevMask && prevMask[i] === 1
          ? opts.thresholdLow + opts.maskHysteresis
          : opts.thresholdLow;
      candidateMask[i] = l <= thresh ? 1 : 0;
    } else {
      const thresh =
        prevMask && prevMask[i] === 1
          ? opts.thresholdHigh - opts.maskHysteresis
          : opts.thresholdHigh;
      candidateMask[i] = l >= thresh ? 1 : 0;
    }
  }

  const floodMask = computeBorderConnectedMask(candidateMask, rows, cols);
  const finalMask = new Uint8Array(floodMask);

  if (prevMask) {
    const dilated = new Uint8Array(prevMask);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (prevMask[r * cols + c] === 1) continue;
        let hasBg = false;
        for (let dr = -1; dr <= 1 && !hasBg; dr++) {
          for (let dc = -1; dc <= 1 && !hasBg; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && prevMask[nr * cols + nc] === 1) {
              hasBg = true;
            }
          }
        }
        if (hasBg) dilated[r * cols + c] = 1;
      }
    }
    for (let i = 0; i < total; i++) {
      if (finalMask[i] === 0 && candidateMask[i] === 1 && dilated[i] === 1) {
        finalMask[i] = 1;
      }
    }
  }

  let contentMin = 255;
  let contentMax = 0;
  for (let i = 0; i < total; i++) {
    if (finalMask[i] === 0) {
      if (lumGrid[i] < contentMin) contentMin = lumGrid[i];
      if (lumGrid[i] > contentMax) contentMax = lumGrid[i];
    }
  }
  if (contentMax <= contentMin) {
    contentMin = 0;
    contentMax = 255;
  }
  const lumRange = Math.max(1, contentMax - contentMin);
  const chars = opts.resolvedChars;
  const numChars = chars.length;

  const frameRows = [];
  for (let r = 0; r < rows; r++) {
    let text = "";
    const colors = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (finalMask[idx] === 1) {
        text += " ";
        colors.push("");
      } else {
        const l = lumGrid[idx];
        const ratio = bg === "light" ? (contentMax - l) / lumRange : (l - contentMin) / lumRange;
        const charIdx = Math.max(1, Math.min(numChars - 1, Math.floor(ratio * (numChars - 1))));
        text += chars[charIdx];
        if (!opts.colored) {
          colors.push("");
        } else {
          const cr = quantize(rgbBuffer[idx * 3], opts.colorStep);
          const cg = quantize(rgbBuffer[idx * 3 + 1], opts.colorStep);
          const cb = quantize(rgbBuffer[idx * 3 + 2], opts.colorStep);
          colors.push(
            `${cr.toString(16).padStart(2, "0")}${cg.toString(16).padStart(2, "0")}${cb.toString(16).padStart(2, "0")}`,
          );
        }
      }
    }
    frameRows.push([text, colors]);
  }

  return {
    rows: frameRows,
    state: { bg, cols, rows, finalMask },
  };
}

// True 3D Z-buffer torus renderer (extracted from bas3line/ascii shapes3d.ts & donut.c)
function renderTorus3dFrame(cols, rows, A, B, chars, colored) {
  const chGrid = new Array(cols * rows).fill(" ");
  const coGrid = new Array(cols * rows).fill("");
  const zBuf = new Float32Array(cols * rows).fill(-Infinity);

  const cosA = Math.cos(A),
    sinA = Math.sin(A);
  const cosB = Math.cos(B),
    sinB = Math.sin(B);
  const R1 = 1.0,
    R2 = 2.0,
    K2 = 5.2;
  const K1 = (cols * K2 * 3) / (8 * (R1 + R2)) * 0.55;
  const palette = accentPalette(ACCENT); // accent 派生 ramp (原为写死的青橙品牌色板)

  for (let theta = 0; theta < Math.PI * 2; theta += 0.06) {
    const costheta = Math.cos(theta),
      sintheta = Math.sin(theta);
    for (let phi = 0; phi < Math.PI * 2; phi += 0.025) {
      const cosphi = Math.cos(phi),
        sinphi = Math.sin(phi);
      const circlex = R2 + R1 * costheta;
      const circley = R1 * sintheta;

      const x = circlex * (cosB * cosphi + sinA * sinB * sinphi) - circley * cosA * sinB;
      const y = circlex * (sinB * cosphi - sinA * cosB * sinphi) + circley * cosA * cosB;
      const z = K2 + cosA * circlex * sinphi + circley * sinA;
      const ooz = 1 / z;

      const xp = Math.floor(cols / 2 + K1 * ooz * x);
      const yp = Math.floor(rows / 2 - K1 * 0.52 * ooz * y);
      if (xp < 0 || xp >= cols || yp < 0 || yp >= rows) continue;

      const L =
        cosphi * costheta * sinB -
        cosA * costheta * sinphi -
        sinA * sintheta +
        cosB * (cosA * sintheta - costheta * sinA * sinphi);

      const idx = xp + yp * cols;
      if (ooz > zBuf[idx]) {
        zBuf[idx] = ooz;
        const lum = Math.max(0.08, (L + 1.414) / 2.828);
        const cIdx = Math.max(1, Math.min(chars.length - 1, Math.floor(lum * (chars.length - 1))));
        chGrid[idx] = chars[cIdx];
        if (colored) {
          const pIdx = Math.min(palette.length - 1, Math.floor(lum * palette.length));
          coGrid[idx] = palette[pIdx];
        }
      }
    }
  }

  const frameRows = [];
  for (let r = 0; r < rows; r++) {
    const start = r * cols;
    frameRows.push([chGrid.slice(start, start + cols).join(""), coGrid.slice(start, start + cols)]);
  }
  return frameRows;
}

function generateProceduralFrames(preset, cols, rows, frameCount, opts) {
  const frames = [];
  const chars = opts.resolvedChars;

  for (let f = 0; f < frameCount; f++) {
    const t = (f / frameCount) * Math.PI * 2;
    if (preset === "torus3d") {
      frames.push({
        rows: renderTorus3dFrame(cols, rows, t, t * 0.5, chars, opts.colored),
      });
      continue;
    }

    const frameRows = [];
    for (let r = 0; r < rows; r++) {
      let text = "";
      const colors = [];
      const ny = (r / rows) * 2 - 1;
      for (let c = 0; c < cols; c++) {
        const nx = ((c / cols) * 2 - 1) * (cols / (rows * 2));
        let intensity = 0;
        let hex = "";

        if (preset === "donut") {
          const dist = Math.sqrt(nx * nx + ny * ny);
          const angle = Math.atan2(ny, nx);
          const ringRadius = 0.55 + 0.08 * Math.sin(t + angle * 2);
          const tube = Math.abs(dist - ringRadius);
          if (tube < 0.24) {
            const normalZ = Math.sqrt(Math.max(0, 1 - Math.pow(tube / 0.24, 2)));
            const light = 0.5 + 0.5 * Math.cos(angle - t * 2) * normalZ;
            intensity = Math.max(0.1, Math.min(1, light));
            hex = opts.colored ? ACCENT : "";
          }
        } else if (preset === "matrix") {
          const colSeed = Math.sin(c * 91.7) * 43758.5453;
          const speed = 1 + (Math.abs(colSeed) % 2);
          const head = (f * speed + Math.floor(Math.abs(colSeed) * rows)) % rows;
          const trail = (head - r + rows) % rows;
          if (trail < 10) {
            intensity = 1 - trail / 10;
            hex = trail === 0 ? "ffffff" : "00ff66";
          }
        } else {
          const wave =
            Math.sin(nx * 3.2 + t) * Math.cos(ny * 2.8 - t) * 0.5 +
            Math.sin((nx + ny) * 4.5 + t * 2) * 0.25 +
            0.25;
          if (wave > 0.12) {
            intensity = Math.min(1, wave);
            hex = opts.colored ? (wave > 0.65 ? mix(ACCENT, "ffffff", 0.55) : ACCENT) : "";
          }
        }

        if (intensity <= 0.05) {
          text += " ";
          colors.push("");
        } else {
          const idx = Math.max(
            1,
            Math.min(chars.length - 1, Math.floor(intensity * (chars.length - 1))),
          );
          text += chars[idx];
          colors.push(opts.colored ? hex : "");
        }
      }
      frameRows.push([text, colors]);
    }
    frames.push({ rows: frameRows });
  }
  return frames;
}

function resolveFfmpegBin() {
  const pyProbe = spawnSync(
    "python",
    ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"],
    { encoding: "utf8" },
  );
  if (pyProbe.status === 0 && pyProbe.stdout && fs.existsSync(pyProbe.stdout.trim())) {
    return pyProbe.stdout.trim();
  }
  return "ffmpeg";
}

function extractVideoFramesViaFfmpeg(videoPath, cols, fps, fontRatio, maxFrames, opts) {
  const ffmpegBin = resolveFfmpegBin();
  const infoProbe = spawnSync(ffmpegBin, ["-hide_banner", "-i", videoPath], {
    encoding: "utf8",
  });
  const stderrText = `${infoProbe.stdout ?? ""}\n${infoProbe.stderr ?? ""}`;
  const dimMatch =
    stderrText.match(/Stream #\d+:\d+[^\n]*Video:[^\n]*?,\s*(\d{2,5})x(\d{2,5})\b/) ||
    stderrText.match(/\b(\d{3,5})x(\d{3,5})\b/);
  const srcW = dimMatch ? Number.parseInt(dimMatch[1], 10) : 640;
  const srcH = dimMatch ? Number.parseInt(dimMatch[2], 10) : 480;
  const rows = Math.max(1, Math.round(((cols * srcH) / Math.max(1, srcW)) * fontRatio));

  const ff = spawnSync(
    ffmpegBin,
    [
      "-v",
      "error",
      "-i",
      videoPath,
      "-vf",
      `fps=${fps},scale=${cols}:${rows}:flags=lanczos`,
      "-frames:v",
      String(maxFrames),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { maxBuffer: 128 * 1024 * 1024 },
  );

  if (ff.status !== 0 || !ff.stdout || ff.stdout.length === 0) {
    throw new Error(`ffmpeg frame extraction failed: ${ff.stderr?.toString() ?? "unknown error"}`);
  }

  const raw = ff.stdout;
  const frameBytes = cols * rows * 3;
  const totalFrames = Math.floor(raw.length / frameBytes);
  const frames = [];
  let prevState = null;

  for (let i = 0; i < totalFrames; i++) {
    const slice = raw.subarray(i * frameBytes, (i + 1) * frameBytes);
    const converted = convertRgbFrameToAscii(slice, cols, rows, opts, prevState);
    prevState = converted.state;
    frames.push({ rows: converted.rows });
  }

  return { rows, frames };
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Zero-JS pure CSS @keyframes animated SVG exporter (extracted from bas3line/ascii/src/svg.ts)
function buildAnimatedSvg(runeData) {
  const { columns, rows, fps } = runeData.meta;
  const frames = runeData.frames;
  const cw = 8;
  const ch = 15;
  const width = columns * cw + 16;
  const height = rows * ch + 16;
  const n = frames.length;
  const durationSec = Math.max(0.5, n / Math.max(1, fps)).toFixed(2);

  const cssRules = [];
  const groups = [];

  for (let i = 0; i < n; i++) {
    const startPct = ((i / n) * 100).toFixed(2);
    const endPct = (((i + 1) / n) * 100).toFixed(2);
    cssRules.push(
      `@keyframes k${i}{0%,${startPct}%{visibility:hidden}${startPct}%,${endPct}%{visibility:visible}${endPct}%,100%{visibility:hidden}}`,
    );
    cssRules.push(`.f${i}{visibility:hidden;animation:k${i} ${durationSec}s linear infinite}`);

    const textEls = [];
    const frameRows = frames[i].rows;
    for (let r = 0; r < frameRows.length; r++) {
      const [lineText, colors] = frameRows[r];
      if (!lineText.trim()) continue;
      let spans = "";
      let runText = "";
      let runColor = colors[0] || ACCENT;
      for (let c = 0; c < lineText.length; c++) {
        const curColor = colors[c] || runColor || ACCENT;
        if (curColor !== runColor && runText) {
          spans += `<tspan fill="#${runColor}">${escapeXml(runText)}</tspan>`;
          runText = lineText[c];
          runColor = curColor;
        } else {
          runText += lineText[c];
        }
      }
      if (runText) {
        spans += `<tspan fill="#${runColor}">${escapeXml(runText)}</tspan>`;
      }
      textEls.push(`<text x="8" y="${12 + r * ch}" xml:space="preserve">${spans}</text>`);
    }
    groups.push(`<g class="f${i}">${textEls.join("")}</g>`);
  }

  cssRules.push(
    `@media (prefers-reduced-motion:reduce){.g{animation:none}.f0{visibility:visible}}`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(runeData.meta.name)}">
<style>
  text{font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;dominant-baseline:hanging}
  ${cssRules.join("\n  ")}
</style>
<rect width="100%" height="100%" rx="8" fill="#${DBG}"/>
${groups.join("\n")}
</svg>`;
}

function buildStandaloneHtml(runeData) {
  const jsonStr = JSON.stringify(runeData);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ASCII Animation — ${runeData.meta.name}</title>
<style>
  body { margin: 0; background: #${DBG}; color: #e2e8f0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  canvas { max-width: 95vw; max-height: 85vh; background: #000; border: 1px solid #${mix(DBG, ACCENT, 0.4)}; border-radius: 8px; box-shadow: 0 0 36px ${hexToRgba(ACCENT, 0.14)}; }
  .meta { margin-top: 12px; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
  <canvas id="stage"></canvas>
  <div class="meta">${runeData.meta.name} · ${runeData.meta.columns}×${runeData.meta.rows} cells · ${runeData.meta.fps} fps · ${runeData.meta.frameCount} frames</div>
  <script>
    const DATA = ${jsonStr};
    const canvas = document.getElementById("stage");
    const ctx = canvas.getContext("2d");
    const fontSize = 12;
    const charW = fontSize * 0.6;
    const lineH = fontSize;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.ceil(DATA.meta.columns * charW);
    const h = Math.ceil(DATA.meta.rows * lineH);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = fontSize + "px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = "top";

    let idx = 0;
    let last = 0;
    const interval = 1000 / DATA.meta.fps;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function draw(frameIndex) {
      ctx.clearRect(0, 0, w, h);
      const frame = DATA.frames[frameIndex % DATA.frames.length];
      for (let r = 0; r < frame.rows.length; r++) {
        const [text, colors] = frame.rows[r];
        for (let c = 0; c < text.length; c++) {
          const ch = text[c];
          if (ch === " ") continue;
          const hex = colors[c];
          ctx.fillStyle = hex ? "#" + hex : "#${ACCENT}";
          ctx.fillText(ch, c * charW, r * lineH);
        }
      }
    }

    draw(0);
    if (!reduced && DATA.frames.length > 1) {
      requestAnimationFrame(function loop(now) {
        if (now - last >= interval) {
          last = now;
          idx = (idx + 1) % DATA.frames.length;
          draw(idx);
        }
        requestAnimationFrame(loop);
      });
    }
  </script>
</body>
</html>`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  ACCENT = opts.accent;
  DBG = opts.bg;
  if (!opts.output || (!opts.input && !opts.preset)) {
    console.error("Error: --output and either --input or --preset are required.");
    printUsage();
    process.exit(2);
  }

  opts.resolvedChars = opts.chars ?? LOOK_RAMPS[opts.look] ?? LOOK_RAMPS.ascii;
  const animName = opts.name ?? path.basename(opts.output).replace(/(\.rune)?\.json$/i, "");

  let rows = Math.max(10, Math.round(opts.columns * 0.55 * opts.fontRatio));
  let frames = [];

  try {
    if (opts.input) {
      if (!fs.existsSync(opts.input)) {
        console.error(`Input video not found: ${opts.input}`);
        process.exit(2);
      }
      const res = extractVideoFramesViaFfmpeg(
        opts.input,
        opts.columns,
        opts.fps,
        opts.fontRatio,
        opts.maxFrames,
        opts,
      );
      rows = res.rows;
      frames = res.frames;
    } else {
      frames = generateProceduralFrames(opts.preset, opts.columns, rows, opts.maxFrames, opts);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const runeData = {
    version: 1,
    meta: {
      name: animName,
      fps: opts.fps,
      columns: opts.columns,
      rows,
      frameCount: frames.length,
      colored: opts.colored,
      generatedWith: {
        source: opts.input ? path.basename(opts.input) : `preset:${opts.preset}`,
        thresholdLow: opts.thresholdLow,
        thresholdHigh: opts.thresholdHigh,
        chars: opts.resolvedChars,
        fontRatio: opts.fontRatio,
        look: opts.look,
      },
    },
    frames,
  };

  fs.mkdirSync(path.dirname(path.resolve(opts.output)), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(runeData));

  if (opts.html) {
    fs.mkdirSync(path.dirname(path.resolve(opts.html)), { recursive: true });
    fs.writeFileSync(opts.html, buildStandaloneHtml(runeData));
  }

  if (opts.svg) {
    fs.mkdirSync(path.dirname(path.resolve(opts.svg)), { recursive: true });
    fs.writeFileSync(opts.svg, buildAnimatedSvg(runeData));
  }

  const summary = {
    ok: true,
    output: opts.output,
    html: opts.html,
    svg: opts.svg,
    columns: opts.columns,
    rows,
    frameCount: frames.length,
    fps: opts.fps,
    colored: opts.colored,
  };

  if (opts.asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `Generated ${opts.output} (${opts.columns}x${rows} cells, ${frames.length} frames @ ${opts.fps}fps)${opts.html ? ` + ${opts.html}` : ""}${opts.svg ? ` + ${opts.svg}` : ""}`,
    );
  }
}

main();
