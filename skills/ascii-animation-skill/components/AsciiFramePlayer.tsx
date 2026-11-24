"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type AsciiLookName =
  | "original"
  | "dots"
  | "ascii"
  | "dense"
  | "numbers"
  | "binary"
  | "blocks"
  | "squares"
  | "lines"
  | "dither";

export interface RuneAnimationMeta {
  name: string;
  fps: number;
  columns: number;
  rows: number;
  frameCount: number;
  colored: boolean;
}

export interface RuneFrame {
  rows: [string, string[]][];
}

export interface RuneAnimationData {
  version: number;
  meta: RuneAnimationMeta;
  frames: RuneFrame[];
}

export type ProceduralFrameFn = (t: number) => string;

export interface AsciiFramePlayerProps {
  /** Pre-baked .rune.json data object */
  data?: RuneAnimationData;
  /** URL to fetch .rune.json from */
  src?: string;
  /** Procedural piece function (tSeconds) => multi-line string (ascii.rest / ascii-magic style) */
  piece?: ProceduralFrameFn;
  /** Override playback FPS (default 24 or from data.meta.fps) */
  fps?: number;
  /** Loop animation (default true) */
  loop?: boolean;
  /** Character set restyling look (from ascii-magic-art) */
  look?: AsciiLookName;
  /** Font size in px (default 12) */
  fontSize?: number;
  /** Accessible description */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

const LOOK_RAMPS: Record<Exclude<AsciiLookName, "original" | "dither">, string> = {
  dots: " ·•●",
  ascii: " .,-~:;=!*#$@",
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  numbers: " 1723456980",
  binary: " 01",
  blocks: " ░▒▓█",
  squares: " ·▪◼█",
  lines: " ╶─═━",
};

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function estimateCharInk(ch: string): number {
  if (ch === " ") return 0;
  const idx = LOOK_RAMPS.dense.indexOf(ch);
  if (idx !== -1) return idx / (LOOK_RAMPS.dense.length - 1);
  if (ch === "░") return 0.25;
  if (ch === "▒") return 0.5;
  if (ch === "▓") return 0.75;
  if (ch === "█") return 1;
  return 0.55;
}

function restyleText(raw: string, look: AsciiLookName): string {
  if (look === "original") return raw;
  const lines = raw.split("\n");
  if (look === "dither") {
    return lines
      .map((line, y) =>
        Array.from(line)
          .map((ch, x) => {
            if (ch === " ") return " ";
            const ink = estimateCharInk(ch);
            return ink > (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? "█" : " ";
          })
          .join(""),
      )
      .join("\n");
  }
  const ramp = LOOK_RAMPS[look];
  return lines
    .map((line) =>
      Array.from(line)
        .map((ch) => {
          if (ch === " ") return " ";
          const ink = estimateCharInk(ch);
          const idx = Math.max(1, Math.min(ramp.length - 1, Math.round(ink * (ramp.length - 1))));
          return ramp[idx];
        })
        .join(""),
    )
    .join("\n");
}

export function AsciiFramePlayer({
  data,
  src,
  piece,
  fps,
  loop = true,
  look = "original",
  fontSize = 12,
  label = "ASCII animation",
  className,
  style,
}: AsciiFramePlayerProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loadedData, setLoadedData] = useState<RuneAnimationData | null>(data ?? null);
  const [inView, setInView] = useState<boolean>(true);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  useEffect(() => {
    if (data) {
      setLoadedData(data);
      return;
    }
    if (!src) return;
    let active = true;
    fetch(src)
      .then((res) => res.json())
      .then((json: RuneAnimationData) => {
        if (active) setLoadedData(json);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [data, src]);

  useEffect(() => {
    const target = canvasRef.current ?? preRef.current;
    if (!target) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setInView(e.isIntersecting);
      },
      { threshold: 0.05 },
    );
    io.observe(target);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);

    return () => {
      io.disconnect();
      mq.removeEventListener("change", onChange);
    };
  }, [loadedData]);

  const useCanvasMode = Boolean(
    loadedData &&
      loadedData.meta.colored &&
      (loadedData.meta.columns * loadedData.meta.rows >= 12000 || loadedData.meta.columns >= 140),
  );

  useEffect(() => {
    const targetFps = fps ?? loadedData?.meta.fps ?? 24;
    const frameInterval = 1000 / Math.max(1, targetFps);
    let rafId: number | null = null;
    let lastTime = 0;
    let frameIndex = 0;
    const startTime = performance.now();

    const drawFrame = (now: number) => {
      if (piece) {
        const elapsedSec = reducedMotion ? 0 : (now - startTime) / 1000;
        const raw = piece(elapsedSec);
        if (preRef.current) {
          preRef.current.textContent = restyleText(raw, look);
        }
        return;
      }

      if (!loadedData || loadedData.frames.length === 0) return;
      const frame = loadedData.frames[frameIndex % loadedData.frames.length];
      const plainText = frame.rows.map((r) => r[0]).join("\n");
      const styled = restyleText(plainText, look);

      if (useCanvasMode && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        const charW = fontSize * 0.6;
        const lineH = fontSize;
        const w = Math.ceil(loadedData.meta.columns * charW);
        const h = Math.ceil(loadedData.meta.rows * lineH);
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        ctx.textBaseline = "top";
        const styledRows = styled.split("\n");
        for (let r = 0; r < frame.rows.length; r++) {
          const [, colors] = frame.rows[r];
          const rowChars = styledRows[r] ?? "";
          for (let c = 0; c < rowChars.length; c++) {
            const ch = rowChars[c];
            if (ch === " ") continue;
            const hex = colors[c];
            ctx.fillStyle = hex ? `#${hex}` : "currentColor";
            ctx.fillText(ch, c * charW, r * lineH);
          }
        }
      } else if (preRef.current) {
        preRef.current.textContent = styled;
      }
    };

    const tick = (now: number) => {
      if (now - lastTime >= frameInterval) {
        lastTime = now;
        drawFrame(now);
        if (loadedData) {
          if (frameIndex + 1 >= loadedData.frames.length && !loop) {
            return;
          }
          frameIndex = (frameIndex + 1) % Math.max(1, loadedData.frames.length);
        }
      }
      if (inView && !reducedMotion && !document.hidden) {
        rafId = requestAnimationFrame(tick);
      }
    };

    drawFrame(performance.now());
    if (inView && !reducedMotion) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [fps, fontSize, inView, loadedData, look, loop, piece, reducedMotion, useCanvasMode]);

  if (useCanvasMode) {
    return (
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className={className}
        style={style}
      />
    );
  }

  return (
    <pre
      ref={preRef}
      role="img"
      aria-label={label}
      className={className}
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: `${fontSize}px`,
        lineHeight: 1,
        margin: 0,
        whiteSpace: "pre",
        overflow: "hidden",
        ...style,
      }}
    />
  );
}
