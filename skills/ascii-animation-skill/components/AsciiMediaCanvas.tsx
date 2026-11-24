"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

export type AsciiColorMode = "dark" | "color" | "phosphor";
export type AsciiPatternMode = "code-matrix" | "ramp" | "dots" | "dither" | "perlin";
export type AsciiRenderMode = "ascii" | "particles";
export type AsciiParticleStyle = "dots" | "diamonds" | "voxels";

export interface AsciiMediaCanvasProps {
  /** Video (.mp4, .webm, .mov) or image URL. If omitted, renders procedural pattern. */
  mediaSource?: string;
  /**
   * "ascii" = structured code/glyph matrix,
   * "particles" = non-alphanumeric 1:1 native aspect-ratio glowing pointillist particle field
   */
  renderMode?: AsciiRenderMode;
  /**
   * Particle cell step in CSS pixels when renderMode === "particles" (default 8.5).
   * Controlled strictly via component props or ascii-animation-spec.json — never via in-page UI controls.
   */
  particleSize?: number;
  /** Geometric shape when renderMode === "particles" ("dots" | "diamonds" | "voxels") */
  particleStyle?: AsciiParticleStyle;
  /** Preserve native media aspect ratio ("contain" = full frame no crop, "cover" = fill container) */
  aspectFit?: "contain" | "cover";
  /** "dark" = monochrome alpha, "color" = HSL-boosted truecolor, "phosphor" = CRT terminal tint */
  colorMode?: AsciiColorMode;
  /** Render faint ambient characters/particles outside the video foreground mask */
  showPattern?: boolean;
  /** Background character generation strategy */
  patternMode?: AsciiPatternMode;
  /** Custom character set for color/ramp modes (sorted light-to-dark for ramp mode) */
  asciiChars?: string;
  /** Phosphor primary hex color when colorMode === "phosphor" (default "#33FF66") */
  phosphorColor?: string;
  /** Font size in CSS pixels when renderMode === "ascii" (default 10) */
  fontSize?: number;
  /** Accessible label for screen readers */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

interface CharCell {
  original: string;
  current: string;
  isSpace: boolean;
  phaseOffset: number;
}

interface CharLine {
  y: number;
  lineIndex: number;
  chars: CharCell[];
  phaseOffset: number;
  maxCharsPerLine: number;
}

interface GridMetrics {
  width: number;
  height: number;
  charsWidth: number;
  charsHeight: number;
  pixelOffsetX: number;
  pixelOffsetY: number;
  pixelWidth: number;
  pixelHeight: number;
  baseCharWidth: number;
  baseCharHeight: number;
}

const VIDEO_EXTS = [".mp4", ".webm", ".ogg", ".mov", ".avi"];
const ALPHANUM_SYM =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
const CODE_KEYWORDS = [
  "function", "const", "let", "var", "return", "async", "await", "import", "export",
  "class", "extends", "interface", "type", "enum", "struct", "void", "int", "char",
  "if", "else", "for", "while", "switch", "case", "break", "continue", "default",
  "try", "catch", "throw", "finally", "new", "delete", "typeof", "instanceof",
  "public", "private", "protected", "static", "readonly", "abstract", "null",
  "undefined", "true", "false", "NaN", "Infinity", "never", "Array", "Object",
  "String", "Number", "Boolean", "Symbol", "Map", "Set", "Promise", "Observable",
  "Stream", "Buffer", "Event", "Error", "document", "window", "console", "process",
  "module", "require", "exports", "TCP", "HTTP", "HTTPS", "SSH", "DNS", "API",
  "REST", "JSON", "kernel", "socket", "buffer", "stream", "pipe", "fork", "exec",
  "spawn", "malloc", "free", "sizeof", "typedef", "SELECT", "FROM", "WHERE", "JOIN",
];
const OPERATORS = [
  "=>", "->", "::", "&&", "||", "==", "!=", "<=", ">=", "++", "--", "+=", "-=",
  "*=", "/=", "<<", ">>", "**", "?.", "??", "...", "|>", "<|",
];
const HEX_CHARS = "0123456789ABCDEFabcdef";
const PUNCT_CLUSTER = "!@#$%^&*()_+-=[]{}|;:,.<>?/~`'\"\\";
const DELIMITERS = ".,;:!?";
const DEFAULT_RAMP = " .,-~:;=!*#$@";
const DOTS_RAMP = " ·•●";
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function hueToRgb(p: number, q: number, t: number): number {
  let tc = t;
  if (tc < 0) tc += 1;
  if (tc > 1) tc -= 1;
  if (tc < 1 / 6) return p + (q - p) * 6 * tc;
  if (tc < 0.5) return q;
  if (tc < 2 / 3) return p + (q - p) * (2 / 3 - tc) * 6;
  return p;
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2d(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const aa = hash2d(xi, yi);
  const ab = hash2d(xi, yi + 1);
  const ba = hash2d(xi + 1, yi);
  const bb = hash2d(xi + 1, yi + 1);
  return (aa * (1 - u) + ba * u) * (1 - v) + (ab * (1 - u) + bb * u) * v;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 23,
      parseInt(clean.slice(2, 4), 16) || 196,
      parseInt(clean.slice(4, 6), 16) || 196,
    ];
  }
  return [23, 196, 196];
}

export function AsciiMediaCanvas({
  mediaSource = "",
  renderMode = "ascii",
  particleSize = 8.5,
  particleStyle = "dots",
  aspectFit = "contain",
  colorMode = "dark",
  showPattern = true,
  patternMode = "code-matrix",
  asciiChars = "@",
  phosphorColor = "#33FF66",
  fontSize = 10,
  label = "Animated ASCII visual",
  className,
  style,
}: AsciiMediaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const linesRef = useRef<CharLine[]>([]);
  const lastMutateRef = useRef<number>(0);
  const isVideoRef = useRef<boolean>(false);
  const mediaElRef = useRef<HTMLVideoElement | HTMLImageElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cachedImageDataRef = useRef<ImageData | null>(null);
  const colorCacheRef = useRef<Map<number, string>>(new Map());
  const metricsRef = useRef<GridMetrics>({
    width: 0,
    height: 0,
    charsWidth: 0,
    charsHeight: 0,
    pixelOffsetX: 0,
    pixelOffsetY: 0,
    pixelWidth: 0,
    pixelHeight: 0,
    baseCharWidth: 6,
    baseCharHeight: fontSize,
  });

  const [inView, setInView] = useState<boolean>(true);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [mediaReady, setMediaReady] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  const effectiveChars = asciiChars && asciiChars.length > 0 ? asciiChars : "@";

  const getCachedRgb = useCallback((r: number, g: number, b: number): string => {
    const key = ((r >> 3) & 31) << 10 | ((g >> 3) & 31) << 5 | ((b >> 3) & 31);
    const cache = colorCacheRef.current;
    const hit = cache.get(key);
    if (hit) return hit;
    const val = `rgb(${r}, ${g}, ${b})`;
    if (cache.size >= 1000) {
      const oldest = Array.from(cache.keys()).slice(0, 500);
      for (const k of oldest) cache.delete(k);
    }
    cache.set(key, val);
    return val;
  }, []);

  // Viewport + Resize + Reduced Motion observers
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    io.observe(el);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setSize({ width, height });
      }
    });
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    }
    ro.observe(el);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMqChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onMqChange);

    return () => {
      io.disconnect();
      ro.disconnect();
      mq.removeEventListener("change", onMqChange);
    };
  }, []);

  // Media element lifecycle
  useEffect(() => {
    if (!mediaSource) {
      setMediaReady(false);
      isVideoRef.current = false;
      mediaElRef.current = null;
      return;
    }
    const lower = mediaSource.toLowerCase().split("?")[0];
    const isVid = VIDEO_EXTS.some((ext) => lower.endsWith(ext));
    isVideoRef.current = isVid;

    if (isVid) {
      const video = document.createElement("video");
      video.src = mediaSource;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      const onReady = () => {
        mediaElRef.current = video;
        if (!offscreenCanvasRef.current) {
          const offscreen = document.createElement("canvas");
          offscreenCanvasRef.current = offscreen;
          offscreenCtxRef.current = offscreen.getContext("2d", { willReadFrequently: true });
        }
        setMediaReady(true);
      };
      video.onloadeddata = onReady;
      video.oncanplay = onReady;
      if (video.readyState >= 2) onReady();
      video.load();
      return () => {
        video.pause();
        video.src = "";
        mediaElRef.current = null;
        offscreenCanvasRef.current = null;
        offscreenCtxRef.current = null;
        cachedImageDataRef.current = null;
      };
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      mediaElRef.current = img;
      const offscreen = document.createElement("canvas");
      offscreenCanvasRef.current = offscreen;
      offscreenCtxRef.current = offscreen.getContext("2d", { willReadFrequently: true });
      setMediaReady(true);
    };
    img.src = mediaSource;
    return () => {
      img.src = "";
      mediaElRef.current = null;
      offscreenCanvasRef.current = null;
      offscreenCtxRef.current = null;
      cachedImageDataRef.current = null;
    };
  }, [mediaSource]);

  // Play / pause video with viewport visibility and reduced motion
  useEffect(() => {
    if (!isVideoRef.current) return;
    const video = mediaElRef.current as HTMLVideoElement | null;
    if (!video || !mediaReady) return;
    if (inView && !reducedMotion) {
      cachedImageDataRef.current = null;
      video.play().catch(() => {});
    } else {
      video.pause();
      const octx = offscreenCtxRef.current;
      const m = metricsRef.current;
      if (octx && m.charsWidth > 0 && m.charsHeight > 0) {
        octx.clearRect(0, 0, m.charsWidth, m.charsHeight);
        octx.drawImage(video, 0, 0, m.charsWidth, m.charsHeight);
        try {
          cachedImageDataRef.current = octx.getImageData(0, 0, m.charsWidth, m.charsHeight);
        } catch {
          // ignore CORS taint if external
        }
      }
    }
  }, [inView, mediaReady, reducedMotion]);

  // Generate one line of structured code-like tokens
  const buildCodeLine = useCallback((cols: number): CharCell[] => {
    let line = "";
    if (Math.random() < 0.12) {
      line = " ".repeat(2 + Math.floor(Math.random() * 4));
    }
    while (line.length < cols - 15) {
      const r = Math.random();
      if (r < 0.3) {
        line += CODE_KEYWORDS[Math.floor(Math.random() * CODE_KEYWORDS.length)];
      } else if (r < 0.45) {
        const len = 2 + Math.floor(Math.random() * 10);
        for (let i = 0; i < len; i++) {
          line += ALPHANUM_SYM[Math.floor(Math.random() * ALPHANUM_SYM.length)];
        }
      } else if (r < 0.55) {
        line += "0x";
        const len = 2 + Math.floor(Math.random() * 6);
        for (let i = 0; i < len; i++) {
          line += HEX_CHARS[Math.floor(Math.random() * HEX_CHARS.length)];
        }
      } else if (r < 0.65) {
        line += OPERATORS[Math.floor(Math.random() * OPERATORS.length)];
      } else if (r < 0.75) {
        const pair =
          Math.random() < 0.33 ? ["(", ")"] : Math.random() < 0.5 ? ["[", "]"] : ["{", "}"];
        line += pair[0];
        const len = 1 + Math.floor(Math.random() * 8);
        for (let i = 0; i < len; i++) {
          line +=
            Math.random() < 0.3
              ? CODE_KEYWORDS[Math.floor(Math.random() * 30)]
              : ALPHANUM_SYM[Math.floor(Math.random() * ALPHANUM_SYM.length)];
        }
        line += pair[1];
      } else if (r < 0.85) {
        line += CODE_KEYWORDS[Math.floor(Math.random() * 40)];
        if (Math.random() < 0.4) {
          line += "_" + CODE_KEYWORDS[Math.floor(Math.random() * 20)];
        }
        if (Math.random() < 0.3) {
          line += String(Math.floor(Math.random() * 1000));
        }
      } else {
        const len = 1 + Math.floor(Math.random() * 4);
        for (let i = 0; i < len; i++) {
          line += PUNCT_CLUSTER[Math.floor(Math.random() * PUNCT_CLUSTER.length)];
        }
      }

      if (line.length < cols - 10) {
        const d = Math.random();
        if (d < 0.45) line += " ";
        else if (d < 0.6) {
          line += DELIMITERS[Math.floor(Math.random() * DELIMITERS.length)] + " ";
        } else if (d < 0.75) line += "  ";
        else if (d < 0.85) line += " | ";
        else line += " - ";
      }
    }
    while (line.length < cols) {
      line += ALPHANUM_SYM[Math.floor(Math.random() * ALPHANUM_SYM.length)];
    }
    const clipped = line.slice(0, cols);
    return clipped.split("").map((ch, idx) => ({
      original: ch,
      current: ch,
      isSpace: ch === " ",
      phaseOffset: (idx / clipped.length) * Math.PI + 0.5 * Math.random(),
    }));
  }, []);

  const setupGrid = useCallback(
    (
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
      mode: AsciiColorMode,
      chars: string,
    ): number => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;

      if (renderMode === "particles") {
        // 1:1 square cell grid: zero aspect-ratio distortion
        const cellStep = Math.max(3.5, Math.min(18, particleSize));
        const media = mediaElRef.current;

        if (media) {
          const mediaW =
            media instanceof HTMLVideoElement ? media.videoWidth || 1280 : media.width || 1280;
          const mediaH =
            media instanceof HTMLVideoElement ? media.videoHeight || 720 : media.height || 720;
          const aspect = mediaW / Math.max(1, mediaH);

          let drawW = cssW;
          let drawH = cssH;
          if (aspectFit === "contain") {
            drawW = cssW * 0.96;
            drawH = drawW / aspect;
            if (drawH > cssH * 0.96) {
              drawH = cssH * 0.96;
              drawW = drawH * aspect;
            }
          } else {
            drawW = cssW;
            drawH = drawW / aspect;
            if (drawH < cssH) {
              drawH = cssH;
              drawW = drawH * aspect;
            }
          }

          const offsetX = (cssW - drawW) / 2;
          const offsetY = (cssH - drawH) / 2;
          const charsW = Math.max(1, Math.round(drawW / cellStep));
          const charsH = Math.max(1, Math.round(drawH / cellStep));

          if (offscreenCanvasRef.current) {
            offscreenCanvasRef.current.width = charsW;
            offscreenCanvasRef.current.height = charsH;
            const octx = offscreenCtxRef.current;
            if (octx) {
              octx.imageSmoothingEnabled = true;
              octx.imageSmoothingQuality = "high";
              octx.clearRect(0, 0, charsW, charsH);
              octx.drawImage(media, 0, 0, charsW, charsH);
              try {
                cachedImageDataRef.current = octx.getImageData(0, 0, charsW, charsH);
              } catch {
                // ignore CORS taint
              }
            }
          }

          metricsRef.current = {
            width: mediaW,
            height: mediaH,
            charsWidth: charsW,
            charsHeight: charsH,
            pixelOffsetX: offsetX,
            pixelOffsetY: offsetY,
            pixelWidth: drawW,
            pixelHeight: drawH,
            baseCharWidth: cellStep,
            baseCharHeight: cellStep,
          };
        } else {
          const cols = Math.max(1, Math.floor(cssW / cellStep));
          const rows = Math.max(1, Math.floor(cssH / cellStep));
          metricsRef.current = {
            width: cssW,
            height: cssH,
            charsWidth: cols,
            charsHeight: rows,
            pixelOffsetX: 0,
            pixelOffsetY: 0,
            pixelWidth: cssW,
            pixelHeight: cssH,
            baseCharWidth: cellStep,
            baseCharHeight: cellStep,
          };
        }

        linesRef.current = [];
        return cellStep;
      }

      ctx.font = `${fontSize}px "Courier New", ui-monospace, monospace`;
      const baseCharWidth = ctx.measureText("M").width || fontSize * 0.6;
      const stepX = 1.3 * baseCharWidth;
      const cols = Math.max(1, Math.floor(cssW / stepX));
      const rows = Math.max(1, Math.floor(cssH / fontSize));

      const media = mediaElRef.current;
      if (media) {
        const mediaW =
          media instanceof HTMLVideoElement ? media.videoWidth || 640 : media.width || 640;
        const mediaH =
          media instanceof HTMLVideoElement ? media.videoHeight || 480 : media.height || 480;
        const aspect = mediaW / Math.max(1, mediaH);
        let drawH = 0.95 * cssH;
        let drawW = drawH * aspect;
        if (drawW > 0.95 * cssW) {
          drawW = 0.95 * cssW;
          drawH = drawW / aspect;
        }
        const offsetX = (cssW - drawW) / 2;
        const offsetY = (cssH - drawH) / 2;
        // Sample at exact stepX / fontSize grid intervals so 1:1 visual aspect ratio is preserved
        const charsW = Math.max(1, Math.ceil(drawW / stepX));
        const charsH = Math.max(1, Math.ceil(drawH / fontSize));

        if (offscreenCanvasRef.current) {
          offscreenCanvasRef.current.width = charsW;
          offscreenCanvasRef.current.height = charsH;
          const octx = offscreenCtxRef.current;
          if (octx) {
            octx.clearRect(0, 0, charsW, charsH);
            octx.drawImage(media, 0, 0, charsW, charsH);
            try {
              cachedImageDataRef.current = octx.getImageData(0, 0, charsW, charsH);
            } catch {
              // ignore CORS taint
            }
          }
        }
        metricsRef.current = {
          width: mediaW,
          height: mediaH,
          charsWidth: charsW,
          charsHeight: charsH,
          pixelOffsetX: offsetX,
          pixelOffsetY: offsetY,
          pixelWidth: drawW,
          pixelHeight: drawH,
          baseCharWidth,
          baseCharHeight: fontSize,
        };
      } else {
        metricsRef.current = {
          width: cssW,
          height: cssH,
          charsWidth: cols,
          charsHeight: rows,
          pixelOffsetX: 0,
          pixelOffsetY: 0,
          pixelWidth: cssW,
          pixelHeight: cssH,
          baseCharWidth,
          baseCharHeight: fontSize,
        };
      }

      const lines: CharLine[] = [];
      for (let r = 0; r < rows; r++) {
        const cells = buildCodeLine(cols);
        if (mode === "color" && chars.length > 0 && patternMode === "code-matrix") {
          for (const c of cells) {
            if (!c.isSpace) {
              c.current = chars[Math.floor(Math.random() * chars.length)];
            }
          }
        }
        lines.push({
          y: r * fontSize,
          lineIndex: r,
          chars: cells,
          phaseOffset: Math.random() * Math.PI * 2,
          maxCharsPerLine: cols,
        });
      }
      linesRef.current = lines;
      return baseCharWidth;
    },
    [aspectFit, buildCodeLine, fontSize, particleSize, patternMode, renderMode],
  );

  // Mutate characters smoothly at ~25Hz
  const mutateMatrix = useCallback(
    (timeMs: number, mode: AsciiColorMode, chars: string) => {
      if (renderMode === "particles") return;
      const pool = mode === "color" ? chars : ALPHANUM_SYM;
      const poolLen = pool.length;
      if (poolLen === 0) return;
      for (const line of linesRef.current) {
        for (let c = 0; c < line.chars.length; c++) {
          const cell = line.chars[c];
          if (
            !cell.isSpace &&
            Math.random() <
              ((Math.sin(0.002 * timeMs + line.phaseOffset + cell.phaseOffset) + 1) / 2) * 0.2
          ) {
            cell.current = pool[Math.floor(Math.random() * poolLen)];
          }
        }
      }
    },
    [renderMode],
  );

  // Non-alphanumeric pointillist particle renderer (ascii.rest 1:1 square grid + Halation bloom)
  const renderParticleFrame = useCallback(
    (ctx: CanvasRenderingContext2D, timeMs: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;

      ctx.fillStyle = "#04070a";
      ctx.fillRect(0, 0, cssW, cssH);

      const m = metricsRef.current;
      const cell = m.baseCharWidth;
      const gw = m.charsWidth;
      const gh = m.charsHeight;
      if (gw <= 0 || gh <= 0) return;

      let imgData: ImageData | null = null;
      if (isVideoRef.current && mediaElRef.current) {
        const video = mediaElRef.current as HTMLVideoElement;
        if (video.readyState >= 2) {
          const octx = offscreenCtxRef.current;
          if (octx) {
            octx.drawImage(video, 0, 0, gw, gh);
            try {
              imgData = octx.getImageData(0, 0, gw, gh);
              cachedImageDataRef.current = imgData;
            } catch {
              // ignore
            }
          }
        }
      }
      if (!imgData) imgData = cachedImageDataRef.current;
      if (!imgData) return;

      const data = imgData.data;
      const ox = m.pixelOffsetX;
      const oy = m.pixelOffsetY;
      const TWO_PI = Math.PI * 2;
      const tSec = timeMs * 0.0018;

      if (showPattern && (ox > 4 || oy > 4)) {
        ctx.fillStyle = "rgba(23, 196, 196, 0.06)";
        const totalCols = Math.floor(cssW / cell);
        const totalRows = Math.floor(cssH / cell);
        for (let r = 0; r < totalRows; r += 2) {
          const py = r * cell + cell * 0.5;
          if (py >= oy && py <= oy + m.pixelHeight) continue;
          for (let c = 0; c < totalCols; c += 2) {
            const px = c * cell + cell * 0.5;
            ctx.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
          }
        }
      }

      for (let gy = 0; gy < gh; gy++) {
        const cy = oy + gy * cell + cell * 0.5;
        const rowOffset = gy * gw;
        const bayerRow = (gy & 3) * 4;

        for (let gx = 0; gx < gw; gx++) {
          const idx = (rowOffset + gx) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          if (a < 16) continue;

          let lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

          // 5-tap unsharp mask for crisp edges in particle space
          let edgeEnergy = 0;
          if (gx > 0 && gx < gw - 1 && gy > 0 && gy < gh - 1) {
            const idxL = idx - 4;
            const idxR = idx + 4;
            const idxU = idx - gw * 4;
            const idxD = idx + gw * 4;
            const lumNeighbors =
              (0.2126 * (data[idxL] + data[idxR] + data[idxU] + data[idxD]) +
                0.7152 * (data[idxL + 1] + data[idxR + 1] + data[idxU + 1] + data[idxD + 1]) +
                0.0722 * (data[idxL + 2] + data[idxR + 2] + data[idxU + 2] + data[idxD + 2])) /
              (4 * 255);
            const detail = lum - lumNeighbors;
            lum = Math.max(0, Math.min(1, lum + detail * 0.95));
            edgeEnergy = Math.min(1, Math.abs(detail) * 3.5);
          }

          // 4x4 Bayer ordered dithering in dark shadows
          const bayer = (BAYER4[bayerRow + (gx & 3)] / 16 - 0.5) * 0.07;
          const ditheredLum = Math.max(0, Math.min(1, lum + bayer));

          if (ditheredLum < 0.04) {
            if (((gx + gy) & 3) === 0 && showPattern) {
              ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
              ctx.fillRect(ox + gx * cell + cell * 0.5 - 0.5, cy - 0.5, 1, 1);
            }
            continue;
          }

          // Inverse-coverage color gain & contrast stretch
          const boost = 1.18 + (1 - ditheredLum) * 0.25 + edgeEnergy * 0.18;
          const cr = Math.min(255, Math.max(0, Math.round(128 + (r - 128) * 1.28 * boost)));
          const cg = Math.min(255, Math.max(0, Math.round(128 + (g - 128) * 1.28 * boost)));
          const cb = Math.min(255, Math.max(0, Math.round(128 + (b - 128) * 1.28 * boost)));

          // Subtle organic micro-oscillation so particles feel alive
          const phase = hash2d(gx, gy) * TWO_PI;
          const wave = Math.sin(tSec + phase);
          const jitterAmp = cell * 0.055 * (0.35 + edgeEnergy * 0.65);
          const cx = ox + gx * cell + cell * 0.5 + Math.cos(tSec * 0.9 + phase) * jitterAmp;
          const py = cy + wave * jitterAmp;

          // Deliberate dark negative space (~24% gap between brightest particles)
          const normRadius = Math.pow(ditheredLum, 0.72) * (1 + 0.05 * wave);
          const radius = Math.max(0.65, normRadius * cell * 0.38);

          // Halation outer aura on bright/edge particles
          if (ditheredLum > 0.62 || edgeEnergy > 0.32) {
            const haloRadius = radius * 1.65;
            ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${(0.14 * ditheredLum).toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(cx, py, haloRadius, 0, TWO_PI);
            ctx.fill();
          }

          ctx.fillStyle = getCachedRgb(cr, cg, cb);

          if (particleStyle === "dots") {
            ctx.beginPath();
            ctx.arc(cx, py, radius, 0, TWO_PI);
            ctx.fill();
            if (ditheredLum > 0.78) {
              ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
              ctx.beginPath();
              ctx.arc(cx, py, radius * 0.36, 0, TWO_PI);
              ctx.fill();
            }
          } else if (particleStyle === "diamonds") {
            const d = radius * 1.18;
            ctx.beginPath();
            ctx.moveTo(cx, py - d);
            ctx.lineTo(cx + d, py);
            ctx.lineTo(cx, py + d);
            ctx.lineTo(cx - d, py);
            ctx.closePath();
            ctx.fill();
            if (ditheredLum > 0.78) {
              const cd = d * 0.38;
              ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
              ctx.beginPath();
              ctx.moveTo(cx, py - cd);
              ctx.lineTo(cx + cd, py);
              ctx.lineTo(cx, py + cd);
              ctx.lineTo(cx - cd, py);
              ctx.closePath();
              ctx.fill();
            }
          } else {
            const side = radius * 1.65;
            const rCorner = Math.min(2, side * 0.25);
            ctx.beginPath();
            ctx.roundRect(cx - side * 0.5, py - side * 0.5, side, side, rCorner);
            ctx.fill();
            if (ditheredLum > 0.8) {
              const core = side * 0.36;
              ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
              ctx.fillRect(cx - core * 0.5, py - core * 0.5, core, core);
            }
          }
        }
      }
    },
    [getCachedRgb, particleStyle, showPattern],
  );

  const renderFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      baseCharWidth: number,
      mode: AsciiColorMode,
      drawBgPattern: boolean,
      chars: string,
      timeMs: number,
    ) => {
      if (renderMode === "particles") {
        renderParticleFrame(ctx, timeMs);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const stepX = 1.3 * baseCharWidth;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px "Courier New", ui-monospace, monospace`;
      ctx.textBaseline = "top";

      const m = metricsRef.current;
      let imgData: ImageData | null = null;
      if (isVideoRef.current && mediaElRef.current && m.charsWidth > 0) {
        const video = mediaElRef.current as HTMLVideoElement;
        if (video.readyState >= 2) {
          const octx = offscreenCtxRef.current;
          if (octx) {
            octx.clearRect(0, 0, m.charsWidth, m.charsHeight);
            octx.drawImage(video, 0, 0, m.charsWidth, m.charsHeight);
            try {
              imgData = octx.getImageData(0, 0, m.charsWidth, m.charsHeight);
            } catch {
              // ignore
            }
          }
        }
      }
      if (!imgData) imgData = cachedImageDataRef.current;

      const hasMedia = imgData !== null;
      const data = imgData?.data;
      const halfStepX = stepX / 2;
      const [phosR, phosG, phosB] = parseHexRgb(phosphorColor);
      const rampChars =
        patternMode === "dots"
          ? DOTS_RAMP
          : chars.length > 1
            ? chars
            : DEFAULT_RAMP;

      for (const line of linesRef.current) {
        const y = line.y;
        for (let col = 0; col < line.chars.length; col++) {
          const cell = line.chars[col];
          const x = col * stepX;
          let hitForeground = false;

          if (hasMedia && data) {
            const sampleY = y + fontSize * 0.5 - m.pixelOffsetY;
            const sampleX = x + halfStepX - m.pixelOffsetX;
            if (
              sampleX >= 0 &&
              sampleX < m.pixelWidth &&
              sampleY >= 0 &&
              sampleY < m.pixelHeight
            ) {
              const gx = Math.floor((sampleX / m.pixelWidth) * m.charsWidth);
              const gy = Math.floor((sampleY / m.pixelHeight) * m.charsHeight);
              if (gx >= 0 && gx < m.charsWidth && gy >= 0 && gy < m.charsHeight) {
                const idx = (gy * m.charsWidth + gx) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

                if (lum > 0.05 && a > 20) {
                  hitForeground = true;
                  let glyph = cell.current;
                  if (patternMode === "ramp" || patternMode === "dots") {
                    const rIdx = Math.min(
                      rampChars.length - 1,
                      Math.max(1, Math.floor(lum * (rampChars.length - 1))),
                    );
                    glyph = rampChars[rIdx];
                  } else if (patternMode === "dither") {
                    const threshold = (BAYER4[(line.lineIndex & 3) * 4 + (col & 3)] + 0.5) / 16;
                    glyph = lum > threshold ? "█" : "·";
                  } else if (mode === "color") {
                    glyph = chars.length > 0 ? cell.current : "@";
                  }

                  if (mode === "color") {
                    const rn = r / 255;
                    const gn = g / 255;
                    const bn = b / 255;
                    const maxC = Math.max(rn, gn, bn);
                    const minC = Math.min(rn, gn, bn);
                    const l = (maxC + minC) / 2;
                    let h = 0;
                    let s = 0;
                    if (maxC !== minC) {
                      const d = maxC - minC;
                      s = l > 0.5 ? d / (2 - maxC - minC) : d / (maxC + minC);
                      h =
                        maxC === rn
                          ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
                          : maxC === gn
                            ? ((bn - rn) / d + 2) / 6
                            : ((rn - gn) / d + 4) / 6;
                    }
                    const boostedS = Math.min(1, 1.5 * s);
                    let boostedL = Math.pow(l, 1 / 0.55);
                    boostedL += 0.25 * boostedL;
                    let ro = 0;
                    let go = 0;
                    let bo = 0;
                    if (boostedS === 0) {
                      ro = go = bo = 255 * boostedL;
                    } else {
                      const q =
                        boostedL < 0.5
                          ? boostedL * (1 + boostedS)
                          : boostedL + boostedS - boostedL * boostedS;
                      const p = 2 * boostedL - q;
                      ro = 255 * hueToRgb(p, q, h + 1 / 3);
                      go = 255 * hueToRgb(p, q, h);
                      bo = 255 * hueToRgb(p, q, h - 1 / 3);
                    }
                    const finalR = Math.max(
                      0,
                      Math.min(255, Math.round(128 + (ro - 128) * 1.5)),
                    );
                    const finalG = Math.max(
                      0,
                      Math.min(255, Math.round(128 + (go - 128) * 1.5)),
                    );
                    const finalB = Math.max(
                      0,
                      Math.min(255, Math.round(128 + (bo - 128) * 1.5)),
                    );
                    ctx.fillStyle = getCachedRgb(finalR, finalG, finalB);
                    ctx.fillText(glyph, x, y);
                  } else if (mode === "phosphor") {
                    const alpha = (a / 255) * (0.2 + 0.8 * lum);
                    ctx.fillStyle = `rgba(${phosR}, ${phosG}, ${phosB}, ${alpha.toFixed(2)})`;
                    ctx.fillText(glyph, x, y);
                  } else {
                    const alpha = (a / 255) * (0.15 + 0.85 * lum);
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
                    ctx.fillText(glyph, x, y);
                  }
                }
              }
            }
          } else if (patternMode === "perlin") {
            const nVal = valueNoise2d(col * 0.06 + timeMs * 0.0004, line.lineIndex * 0.06);
            if (nVal > 0.35) {
              hitForeground = true;
              const rIdx = Math.min(
                rampChars.length - 1,
                Math.floor(((nVal - 0.35) / 0.65) * rampChars.length),
              );
              const alpha = 0.15 + (nVal - 0.35) * 0.85;
              ctx.fillStyle =
                mode === "phosphor"
                  ? `rgba(${phosR}, ${phosG}, ${phosB}, ${alpha.toFixed(2)})`
                  : `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
              ctx.fillText(rampChars[rIdx], x, y);
            }
          }

          if (drawBgPattern && !hitForeground) {
            ctx.fillStyle =
              mode === "phosphor"
                ? `rgba(${phosR}, ${phosG}, ${phosB}, 0.12)`
                : "rgba(255, 255, 255, 0.15)";
            ctx.fillText(cell.current, x, y);
          }
        }
      }
    },
    [fontSize, getCachedRgb, patternMode, phosphorColor, renderMode, renderParticleFrame],
  );

  // Main render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const baseCharWidth = setupGrid(canvas, ctx, colorMode, effectiveChars);
    const shouldAnimate = inView && !reducedMotion;

    const tick = (now: number) => {
      if (shouldAnimate && now - lastMutateRef.current > 40) {
        lastMutateRef.current = now;
        mutateMatrix(now, colorMode, effectiveChars);
      }
      renderFrame(ctx, baseCharWidth, colorMode, showPattern, effectiveChars, now);
      if (shouldAnimate) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    if (shouldAnimate) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      renderFrame(ctx, baseCharWidth, colorMode, showPattern, effectiveChars, 0);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    colorMode,
    effectiveChars,
    inView,
    mediaReady,
    mutateMatrix,
    particleSize,
    particleStyle,
    reducedMotion,
    renderFrame,
    renderMode,
    setupGrid,
    showPattern,
    size,
  ]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "transparent",
        }}
      />
    </div>
  );
}
